import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  acquireRenderQueueWorker,
  activeRenderQueueJobForWorker,
  claimNextRenderQueueJob,
  DEFAULT_RENDER_QUEUE_PATH,
  getRenderQueueJob,
  heartbeatRenderQueueWorker,
  nextQueuedRenderQueueJob,
  PersistedRenderQueueJob,
  releaseRenderQueueWorker,
  updateRenderQueueJob,
} from '../src/renderQueue';
import { acquireRenderLock } from '../src/renderLock';
import { signalProcessTree } from '../src/renderProcessRegistry';
import { RenderJobRecord } from '../src/shortVideoBrief';
import {
  projectPaths,
  readBrief,
  readRenderManifest,
  renderStatus,
  writeRenderJob,
} from '../src/shortVideoProjectServer';

function flag(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const queuePath = resolve(flag('queue', DEFAULT_RENDER_QUEUE_PATH));
const renderLockPath = resolve(flag('render-lock', 'output/videos/.videobrief-render.lock'));
const rendererPath = resolve(flag('renderer', 'scripts/export-production.mjs'));
const workerPid = process.pid;
let stopping = false;

function sleep(milliseconds: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function isProcessAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error instanceof Error && 'code' in error && error.code === 'EPERM');
  }
}

function renderJobRecord(job: PersistedRenderQueueJob): RenderJobRecord {
  const { briefPath: _briefPath, ...record } = job;
  return record;
}

function mirrorJob(job: PersistedRenderQueueJob) {
  try {
    const project = JSON.parse(readFileSync(job.briefPath, 'utf8')) as {
      outputs?: { workDir?: string };
    };
    if (!project.outputs?.workDir) return;
    writeRenderJob(resolve(project.outputs.workDir, 'render-job.json'), renderJobRecord(job));
  } catch {
    // Queue state remains authoritative if a project is temporarily unreadable.
  }
}

function updateJob(jobId: string, patch: Partial<PersistedRenderQueueJob>) {
  const job = updateRenderQueueJob(queuePath, jobId, patch);
  if (job) mirrorJob(job);
  return job;
}

function stageFromOutput(text: string): RenderJobRecord['stage'] | null {
  if (text.includes('[videobrief-stage] rendering')) return 'rendering';
  if (text.includes('[videobrief-stage] proof')) return 'proof';
  if (text.includes('[videobrief-stage] awaiting-review')) return 'review';
  if (text.includes('[videobrief-stage] packaging')) return 'packaging';
  return null;
}

function appendTail(current: string, chunk: string) {
  return `${current}${chunk}`.slice(-64 * 1024);
}

function failureSummary(stdout: string, stderr: string) {
  const lines = `${stdout}\n${stderr}`.trim().split('\n').map((line) => line.trimEnd()).filter(Boolean);
  if (lines.length <= 12) return lines.join('\n');
  return [lines[0], ...lines.slice(-11)].join('\n');
}

async function runClaimedJob(job: PersistedRenderQueueJob, lock: NonNullable<ReturnType<typeof acquireRenderLock>>) {
  let stdout = '';
  let stderr = '';
  try {
    const child = spawn(process.execPath, [rendererPath, `--brief=${job.briefPath}`, '--stage=render'], {
      cwd: process.cwd(),
      env: process.env,
      detached: process.platform !== 'win32',
    });
    if (!child.pid) throw new Error('Render worker could not obtain a child process id.');
    lock.transferOwnership(child.pid);
    updateJob(job.jobId, { processId: child.pid, stage: 'rendering' });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout = appendTail(stdout, text);
      const stage = stageFromOutput(text);
      if (stage) updateJob(job.jobId, { stage });
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendTail(stderr, chunk.toString());
    });

    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolvePromise, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolvePromise({ code, signal }));
    });
    const current = getRenderQueueJob(queuePath, job.jobId);
    const completedAt = new Date().toISOString();
    if (current?.state === 'cancelling' || current?.cancelRequestedAt) {
      updateJob(job.jobId, {
        state: 'cancelled',
        stage: 'completed',
        completedAt,
        error: '',
      });
    } else if (result.code === 0) {
      updateJob(job.jobId, {
        state: 'awaiting_review',
        stage: 'review',
        completedAt,
        error: '',
      });
    } else {
      const details = failureSummary(stdout, stderr);
      updateJob(job.jobId, {
        state: 'failed',
        stage: 'completed',
        completedAt,
        error: details || `render exited with ${result.code ?? result.signal ?? 1}`,
      });
    }
  } catch (error) {
    updateJob(job.jobId, {
      state: 'failed',
      stage: 'completed',
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'render worker failed',
    });
  } finally {
    lock.release();
  }
}

function recoveredRenderPassed(job: PersistedRenderQueueJob) {
  try {
    const project = readBrief(job.projectId);
    const paths = projectPaths(project);
    const status = renderStatus(readRenderManifest(paths.manifestPath), project.id);
    return ['awaiting_semantic', 'awaiting_browser', 'review_failed', 'ready'].includes(status.state);
  } catch {
    return false;
  }
}

async function monitorAdoptedJob(job: PersistedRenderQueueJob) {
  if (!job.processId) return;
  while (!stopping && isProcessAlive(job.processId)) {
    const current = getRenderQueueJob(queuePath, job.jobId);
    if (current?.state === 'cancelling') signalProcessTree(job.processId, 'SIGTERM');
    heartbeatRenderQueueWorker(queuePath, workerPid);
    await sleep(250);
  }
  const current = getRenderQueueJob(queuePath, job.jobId);
  if (!current) return;
  const completedAt = new Date().toISOString();
  if (current.state === 'cancelling' || current.cancelRequestedAt) {
    updateJob(job.jobId, { state: 'cancelled', stage: 'completed', completedAt, error: '' });
  } else if (recoveredRenderPassed(current)) {
    updateJob(job.jobId, { state: 'awaiting_review', stage: 'review', completedAt, error: '' });
  } else {
    updateJob(job.jobId, {
      state: 'failed',
      stage: 'completed',
      completedAt,
      error: 'Recovered render process exited without a current passed technical proof.',
    });
  }
}

async function main() {
  if (!acquireRenderQueueWorker(queuePath, workerPid)) return;
  const heartbeat = setInterval(() => heartbeatRenderQueueWorker(queuePath, workerPid), 1_000);
  let released = false;
  try {
    while (!stopping) {
      const adopted = activeRenderQueueJobForWorker(queuePath, workerPid);
      if (adopted?.processId) {
        await monitorAdoptedJob(adopted);
        continue;
      }
      const next = nextQueuedRenderQueueJob(queuePath);
      if (!next) {
        released = releaseRenderQueueWorker(queuePath, workerPid);
        if (released) break;
        continue;
      }
      const lock = acquireRenderLock(renderLockPath, next.projectId, { ownerPid: workerPid });
      if (!lock) {
        heartbeatRenderQueueWorker(queuePath, workerPid);
        await sleep(250);
        continue;
      }
      const claimed = claimNextRenderQueueJob(queuePath, workerPid);
      if (!claimed) {
        lock.release();
        continue;
      }
      mirrorJob(claimed);
      await runClaimedJob(claimed, lock);
    }
  } finally {
    clearInterval(heartbeat);
    if (!released) releaseRenderQueueWorker(queuePath, workerPid);
  }
}

process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });

if (!existsSync(rendererPath)) throw new Error(`Render worker script not found: ${rendererPath}`);
await main();
