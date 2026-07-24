import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  acquireProjectPlanningQueueWorker,
  activeProjectPlanningJobForWorker,
  claimNextProjectPlanningJob,
  DEFAULT_PROJECT_PLANNING_QUEUE_PATH,
  getProjectPlanningJob,
  heartbeatProjectPlanningQueueWorker,
  nextQueuedProjectPlanningJob,
  type PersistedProjectPlanningJob,
  releaseProjectPlanningQueueWorker,
  updateProjectPlanningJob,
} from '../src/projectPlanningQueue';
import { signalProcessTree } from '../src/renderProcessRegistry';
import { updateCanonicalProject } from '../src/shortVideoProjectServer';
import { writeAtomicJson } from '../src/persistentJsonQueue';

function flag(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const queuePath = resolve(flag('queue', DEFAULT_PROJECT_PLANNING_QUEUE_PATH));
const plannerPath = resolve(flag('planner', 'scripts/plan-project.ts'));
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

function planningJobPath(job: PersistedProjectPlanningJob) {
  try {
    const project = JSON.parse(readFileSync(job.briefPath, 'utf8')) as { outputs?: { workDir?: string } };
    return project.outputs?.workDir ? resolve(project.outputs.workDir, 'planning-job.json') : '';
  } catch {
    return '';
  }
}

function mirrorJob(job: PersistedProjectPlanningJob) {
  const path = planningJobPath(job);
  if (path) writeAtomicJson(path, job);
}

function updateJob(jobId: string, patch: Partial<PersistedProjectPlanningJob>) {
  const job = updateProjectPlanningJob(queuePath, jobId, patch);
  if (job) mirrorJob(job);
  return job;
}

function stageFromOutput(text: string): PersistedProjectPlanningJob['stage'] | null {
  if (text.includes('[videobrief-planning-stage] waiting_sources')) return 'waiting_sources';
  if (text.includes('[videobrief-planning-stage] narrative')) return 'narrative';
  if (text.includes('[videobrief-planning-stage] candidates')) return 'candidates';
  if (text.includes('[videobrief-planning-stage] assets')) return 'assets';
  return null;
}

function appendTail(current: string, chunk: string) {
  return `${current}${chunk}`.slice(-64 * 1024);
}

function failureSummary(stdout: string, stderr: string) {
  const lines = `${stdout}\n${stderr}`.trim().split('\n').map((line) => line.trimEnd()).filter(Boolean);
  return lines.length <= 12 ? lines.join('\n') : [lines[0], ...lines.slice(-11)].join('\n');
}

function markProjectInterrupted(projectId: string, message: string) {
  try {
    updateCanonicalProject(projectId, (project) => ({
      ...project,
      narrative: {
        ...project.narrative,
        status: 'failed',
        error: message,
      },
    }));
  } catch {
    // Queue state remains authoritative if the project is temporarily unavailable.
  }
}

function recoveredPlanningPassed(job: PersistedProjectPlanningJob) {
  try {
    const project = JSON.parse(readFileSync(job.briefPath, 'utf8')) as {
      narrative?: { status?: string; activeVersionId?: string };
      scenes?: unknown[];
      platformCopy?: { title?: string };
    };
    return project.narrative?.status === 'completed'
      && Boolean(project.narrative.activeVersionId)
      && Boolean(project.scenes?.length)
      && Boolean(project.platformCopy?.title);
  } catch {
    return false;
  }
}

async function runClaimedJob(job: PersistedProjectPlanningJob) {
  let stdout = '';
  let stderr = '';
  try {
    const child = spawn(process.execPath, [
      '--import',
      'tsx',
      plannerPath,
      job.projectId,
      ...(job.instruction ? [job.instruction] : []),
    ], {
      cwd: process.cwd(),
      env: { ...process.env, VIDEOBRIEF_PROJECT_BRIEF_PATH: job.briefPath },
      detached: process.platform !== 'win32',
    });
    if (!child.pid) throw new Error('Planning worker could not obtain a child process id.');
    updateJob(job.jobId, { processId: child.pid, stage: 'waiting_sources' });
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
    const current = getProjectPlanningJob(queuePath, job.jobId);
    const completedAt = new Date().toISOString();
    if (current?.state === 'cancelling' || current?.cancelRequestedAt) {
      markProjectInterrupted(job.projectId, '策划任务已取消；已保留完成的章节草稿。');
      updateJob(job.jobId, { state: 'cancelled', stage: 'completed', completedAt, error: '' });
    } else if (result.code === 0) {
      updateJob(job.jobId, { state: 'completed', stage: 'completed', completedAt, error: '' });
    } else {
      const details = failureSummary(stdout, stderr);
      updateJob(job.jobId, {
        state: 'failed',
        stage: 'completed',
        completedAt,
        error: details || `planning exited with ${result.code ?? result.signal ?? 1}`,
      });
    }
  } catch (error) {
    updateJob(job.jobId, {
      state: 'failed',
      stage: 'completed',
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'planning worker failed',
    });
  }
}

async function monitorAdoptedJob(job: PersistedProjectPlanningJob) {
  if (!job.processId) return;
  while (!stopping && isProcessAlive(job.processId)) {
    const current = getProjectPlanningJob(queuePath, job.jobId);
    if (current?.state === 'cancelling') signalProcessTree(job.processId, 'SIGTERM');
    heartbeatProjectPlanningQueueWorker(queuePath, workerPid);
    await sleep(250);
  }
  const current = getProjectPlanningJob(queuePath, job.jobId);
  if (!current) return;
  const completedAt = new Date().toISOString();
  if (current.state === 'cancelling' || current.cancelRequestedAt) {
    markProjectInterrupted(job.projectId, '策划任务已取消；已保留完成的章节草稿。');
    updateJob(job.jobId, { state: 'cancelled', stage: 'completed', completedAt, error: '' });
  } else if (recoveredPlanningPassed(current)) {
    updateJob(job.jobId, { state: 'completed', stage: 'completed', completedAt, error: '' });
  } else {
    updateJob(job.jobId, {
      state: 'failed',
      stage: 'completed',
      completedAt,
      error: 'Recovered planning process exited without a completed canonical project.',
    });
  }
}

async function main() {
  if (!acquireProjectPlanningQueueWorker(queuePath, workerPid)) return;
  const heartbeat = setInterval(() => heartbeatProjectPlanningQueueWorker(queuePath, workerPid), 1_000);
  let released = false;
  try {
    while (!stopping) {
      const adopted = activeProjectPlanningJobForWorker(queuePath, workerPid);
      if (adopted?.processId) {
        await monitorAdoptedJob(adopted);
        continue;
      }
      if (!nextQueuedProjectPlanningJob(queuePath)) {
        released = releaseProjectPlanningQueueWorker(queuePath, workerPid);
        if (released) break;
        continue;
      }
      const claimed = claimNextProjectPlanningJob(queuePath, workerPid);
      if (!claimed) continue;
      mirrorJob(claimed);
      await runClaimedJob(claimed);
    }
  } finally {
    clearInterval(heartbeat);
    if (!released) releaseProjectPlanningQueueWorker(queuePath, workerPid);
  }
}

process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });

if (!existsSync(plannerPath)) throw new Error(`Planning worker script not found: ${plannerPath}`);
await main();
