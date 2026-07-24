import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { signalProcessTree } from '../src/renderProcessRegistry';
import {
  acquireSourceProcessingQueueWorker,
  activeSourceProcessingJobForWorker,
  claimNextSourceProcessingJob,
  DEFAULT_SOURCE_PROCESSING_QUEUE_PATH,
  getSourceProcessingJob,
  heartbeatSourceProcessingQueueWorker,
  nextQueuedSourceProcessingJob,
  type PersistedSourceProcessingJob,
  releaseSourceProcessingQueueWorker,
  updateSourceProcessingJob,
} from '../src/sourceProcessingQueue';
import { markProjectSourceProcessingInterrupted } from '../src/sourceProcessingServer';

function flag(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const queuePath = resolve(flag('queue', DEFAULT_SOURCE_PROCESSING_QUEUE_PATH));
const processorPath = resolve(flag('processor', 'scripts/process-project-source.ts'));
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

function appendTail(current: string, chunk: string) {
  return `${current}${chunk}`.slice(-64 * 1024);
}

function failureSummary(stdout: string, stderr: string) {
  const lines = `${stdout}\n${stderr}`.trim().split('\n').map((line) => line.trimEnd()).filter(Boolean);
  if (lines.length <= 16) return lines.join('\n');
  return [...lines.slice(0, 4), '...', ...lines.slice(-12)].join('\n');
}

function currentSource(job: PersistedSourceProcessingJob) {
  try {
    const project = JSON.parse(readFileSync(job.briefPath, 'utf8')) as {
      sources?: Array<{
        id: string;
        processing: {
          status: 'idle' | 'pending' | 'running' | 'completed' | 'failed';
          stage: PersistedSourceProcessingJob['stage'] | 'idle';
          error: string;
        };
      }>;
    };
    return project.sources?.find((source) => source.id === job.sourceId) ?? null;
  } catch {
    return null;
  }
}

function syncStage(job: PersistedSourceProcessingJob) {
  const source = currentSource(job);
  if (!source || source.processing.stage === 'idle') return;
  updateSourceProcessingJob(queuePath, job.jobId, { stage: source.processing.stage });
}

function finishCancelled(job: PersistedSourceProcessingJob) {
  try {
    markProjectSourceProcessingInterrupted(
      job.projectId,
      job.sourceId,
      '资料处理已取消；已完成章节已保留，可重新处理。',
    );
  } catch {
    // The persisted queue can still finish cancellation if its project was moved or deleted.
  }
  return updateSourceProcessingJob(queuePath, job.jobId, {
    state: 'cancelled',
    stage: 'completed',
    completedAt: new Date().toISOString(),
    error: '',
  });
}

async function runClaimedJob(job: PersistedSourceProcessingJob) {
  let stdout = '';
  let stderr = '';
  let stageTimer: ReturnType<typeof setInterval> | null = null;
  try {
    const child = spawn(process.execPath, [
      '--import',
      'tsx',
      processorPath,
      `--project=${job.projectId}`,
      `--source=${job.sourceId}`,
      `--brief=${job.briefPath}`,
    ], {
      cwd: process.cwd(),
      env: process.env,
      detached: process.platform !== 'win32',
    });
    if (!child.pid) throw new Error('Source processing worker could not obtain a child process id.');
    updateSourceProcessingJob(queuePath, job.jobId, { processId: child.pid, stage: 'local-extraction' });
    stageTimer = setInterval(() => {
      const current = getSourceProcessingJob(queuePath, job.jobId);
      if (current?.state === 'cancelling') signalProcessTree(child.pid!, 'SIGTERM');
      syncStage(job);
    }, 250);
    child.stdout.on('data', (chunk) => { stdout = appendTail(stdout, chunk.toString()); });
    child.stderr.on('data', (chunk) => { stderr = appendTail(stderr, chunk.toString()); });

    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolvePromise, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolvePromise({ code, signal }));
    });
    const current = getSourceProcessingJob(queuePath, job.jobId);
    if (current?.state === 'cancelling' || current?.cancelRequestedAt) {
      finishCancelled(job);
      return;
    }
    const source = currentSource(job);
    if (result.code === 0 && source?.processing.status === 'completed') {
      updateSourceProcessingJob(queuePath, job.jobId, {
        state: 'completed',
        stage: 'completed',
        completedAt: new Date().toISOString(),
        error: '',
      });
      return;
    }
    const details = source?.processing.error || failureSummary(stdout, stderr);
    updateSourceProcessingJob(queuePath, job.jobId, {
      state: 'failed',
      stage: 'completed',
      completedAt: new Date().toISOString(),
      error: details || `source processing exited with ${result.code ?? result.signal ?? 1}`,
    });
  } catch (error) {
    updateSourceProcessingJob(queuePath, job.jobId, {
      state: 'failed',
      stage: 'completed',
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'source processing worker failed',
    });
  } finally {
    if (stageTimer) clearInterval(stageTimer);
  }
}

async function monitorAdoptedJob(job: PersistedSourceProcessingJob) {
  if (!job.processId) return;
  while (!stopping && isProcessAlive(job.processId)) {
    const current = getSourceProcessingJob(queuePath, job.jobId);
    if (current?.state === 'cancelling') signalProcessTree(job.processId, 'SIGTERM');
    syncStage(job);
    heartbeatSourceProcessingQueueWorker(queuePath, workerPid);
    await sleep(250);
  }
  const current = getSourceProcessingJob(queuePath, job.jobId);
  if (!current) return;
  if (current.state === 'cancelling' || current.cancelRequestedAt) {
    finishCancelled(job);
    return;
  }
  const source = currentSource(job);
  if (source?.processing.status === 'completed') {
    updateSourceProcessingJob(queuePath, job.jobId, {
      state: 'completed',
      stage: 'completed',
      completedAt: new Date().toISOString(),
      error: '',
    });
  } else if (source?.processing.status === 'failed') {
    updateSourceProcessingJob(queuePath, job.jobId, {
      state: 'failed',
      stage: 'completed',
      completedAt: new Date().toISOString(),
      error: source.processing.error || 'Recovered source process failed.',
    });
  } else {
    updateSourceProcessingJob(queuePath, job.jobId, {
      state: 'queued',
      stage: 'queued',
      startedAt: '',
      completedAt: '',
      processId: undefined,
      workerPid: undefined,
      error: 'Recovered source process ended before completion; retrying from persisted chapters.',
    });
  }
}

async function main() {
  if (!acquireSourceProcessingQueueWorker(queuePath, workerPid)) return;
  const heartbeat = setInterval(() => heartbeatSourceProcessingQueueWorker(queuePath, workerPid), 1_000);
  let released = false;
  try {
    while (!stopping) {
      const adopted = activeSourceProcessingJobForWorker(queuePath, workerPid);
      if (adopted?.processId) {
        await monitorAdoptedJob(adopted);
        continue;
      }
      if (!nextQueuedSourceProcessingJob(queuePath)) {
        released = releaseSourceProcessingQueueWorker(queuePath, workerPid);
        if (released) break;
        continue;
      }
      const claimed = claimNextSourceProcessingJob(queuePath, workerPid);
      if (!claimed) continue;
      await runClaimedJob(claimed);
    }
  } finally {
    clearInterval(heartbeat);
    if (!released) releaseSourceProcessingQueueWorker(queuePath, workerPid);
  }
}

process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });

if (!existsSync(processorPath)) throw new Error(`Source processor script not found: ${processorPath}`);
await main();
