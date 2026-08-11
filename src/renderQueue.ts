import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import type { RenderJobRecord } from './shortVideoBrief';
import {
  isProcessAlive as defaultIsProcessAlive,
  readJsonFile,
  withJsonFileLock,
  writeAtomicJson,
} from './persistentJsonQueue';

export const DEFAULT_RENDER_QUEUE_PATH = resolve('output/render-queue/queue.json');

export interface PersistedRenderQueueJob extends RenderJobRecord {
  jobId: string;
  briefPath: string;
}

interface RenderQueueWorkerRecord {
  pid: number;
  startedAt: string;
  heartbeatAt: string;
}

interface RenderQueueState {
  schemaVersion: 1;
  updatedAt: string;
  worker: RenderQueueWorkerRecord | null;
  jobs: PersistedRenderQueueJob[];
}

interface QueueOptions {
  now?: () => Date;
  isProcessAlive?: (pid: number) => boolean;
}

interface EnqueueOptions extends QueueOptions {
  resumedFromJobId?: string;
}

interface ClaimOptions extends QueueOptions {
  processId?: number;
}

const ACTIVE_STATES = new Set<RenderJobRecord['state']>(['queued', 'running', 'cancelling']);
function emptyQueue(): RenderQueueState {
  return {
    schemaVersion: 1,
    updatedAt: '',
    worker: null,
    jobs: [],
  };
}

function parseQueue(path: string): RenderQueueState {
  return readJsonFile(path, emptyQueue, (raw) => {
    const value = raw as Partial<RenderQueueState>;
    if (value.schemaVersion !== 1 || !Array.isArray(value.jobs)) {
      throw new Error(`Invalid render queue: ${path}`);
    }
    return {
      schemaVersion: 1,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
      worker: value.worker && Number.isInteger(value.worker.pid)
        ? value.worker as RenderQueueWorkerRecord
        : null,
      jobs: value.jobs as PersistedRenderQueueJob[],
    };
  });
}

function withQueueLock<T>(path: string, action: (state: RenderQueueState) => T): T {
  return withJsonFileLock(path, () => action(parseQueue(path)));
}

function persist(path: string, state: RenderQueueState, now: () => Date) {
  state.updatedAt = now().toISOString();
  writeAtomicJson(path, state);
}

function withQueuePositions(jobs: PersistedRenderQueueJob[]) {
  let queuePosition = 0;
  return jobs.map((job) => {
    if (job.state !== 'queued') return { ...job, queuePosition: undefined };
    queuePosition += 1;
    return { ...job, queuePosition };
  });
}

export function listRenderQueueJobs(path = DEFAULT_RENDER_QUEUE_PATH) {
  return withQueuePositions(parseQueue(path).jobs);
}

export function removeRenderQueueJobsForProject(
  path: string,
  projectId: string,
  options: QueueOptions = {},
) {
  const now = options.now ?? (() => new Date());
  return withQueueLock(path, (state) => {
    const removed = state.jobs.filter((job) => job.projectId === projectId);
    state.jobs = state.jobs.filter((job) => job.projectId !== projectId);
    if (removed.length > 0) persist(path, state, now);
    return removed;
  });
}

export function renderQueueWorker(
  path = DEFAULT_RENDER_QUEUE_PATH,
  options: Pick<QueueOptions, 'isProcessAlive'> = {},
) {
  const worker = parseQueue(path).worker;
  if (!worker) return null;
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  return { ...worker, alive: isProcessAlive(worker.pid) };
}

export function getRenderQueueJob(path: string, jobId: string) {
  return listRenderQueueJobs(path).find((job) => job.jobId === jobId) ?? null;
}

export function latestRenderQueueJobForProject(
  path: string,
  projectId: string,
) {
  const jobs = listRenderQueueJobs(path);
  for (let index = jobs.length - 1; index >= 0; index -= 1) {
    if (jobs[index].projectId === projectId) return jobs[index];
  }
  return null;
}

export function nextQueuedRenderQueueJob(path = DEFAULT_RENDER_QUEUE_PATH) {
  return listRenderQueueJobs(path).find((job) => job.state === 'queued') ?? null;
}

export function activeRenderQueueJobForWorker(
  path: string,
  workerPid: number,
) {
  return listRenderQueueJobs(path).find((job) => (
    job.workerPid === workerPid && ['running', 'cancelling'].includes(job.state)
  )) ?? null;
}

export function enqueueRenderQueueJob(
  path: string,
  input: { projectId: string; briefPath: string },
  options: EnqueueOptions = {},
) {
  const now = options.now ?? (() => new Date());
  return withQueueLock(path, (state) => {
    const existing = state.jobs.find((job) => job.projectId === input.projectId && ACTIVE_STATES.has(job.state));
    if (existing) {
      return {
        created: false,
        job: withQueuePositions(state.jobs).find((job) => job.jobId === existing.jobId)!,
      };
    }
    const timestamp = now().toISOString();
    const job: PersistedRenderQueueJob = {
      schemaVersion: 1,
      jobId: randomUUID(),
      projectId: input.projectId,
      briefPath: resolve(input.briefPath),
      state: 'queued',
      stage: 'saving',
      queuedAt: timestamp,
      startedAt: '',
      updatedAt: timestamp,
      completedAt: '',
      error: '',
      ...(options.resumedFromJobId ? { resumedFromJobId: options.resumedFromJobId } : {}),
    };
    state.jobs.push(job);
    persist(path, state, now);
    return {
      created: true,
      job: withQueuePositions(state.jobs).find((item) => item.jobId === job.jobId)!,
    };
  });
}

export function acquireRenderQueueWorker(
  path: string,
  workerPid: number,
  options: QueueOptions = {},
) {
  const now = options.now ?? (() => new Date());
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  return withQueueLock(path, (state) => {
    if (state.worker && state.worker.pid !== workerPid && isProcessAlive(state.worker.pid)) return false;
    const timestamp = now().toISOString();
    for (const job of state.jobs) {
      if (!['running', 'cancelling'].includes(job.state)) continue;
      if (job.processId && isProcessAlive(job.processId)) {
        job.workerPid = workerPid;
        job.updatedAt = timestamp;
        continue;
      }
      if (job.state === 'cancelling') {
        job.state = 'cancelled';
        job.stage = 'completed';
        job.completedAt = timestamp;
      } else {
        job.state = 'queued';
        job.stage = 'saving';
        job.startedAt = '';
        job.completedAt = '';
      }
      job.workerPid = undefined;
      job.processId = undefined;
      job.updatedAt = timestamp;
    }
    state.worker = { pid: workerPid, startedAt: timestamp, heartbeatAt: timestamp };
    persist(path, state, now);
    return true;
  });
}

export function claimNextRenderQueueJob(
  path: string,
  workerPid: number,
  options: ClaimOptions = {},
) {
  const now = options.now ?? (() => new Date());
  return withQueueLock(path, (state) => {
    if (state.jobs.some((item) => ['running', 'cancelling'].includes(item.state))) return null;
    const job = state.jobs.find((item) => item.state === 'queued');
    if (!job) return null;
    const timestamp = now().toISOString();
    job.state = 'running';
    job.stage = 'saving';
    job.workerPid = workerPid;
    job.processId = options.processId;
    job.queuePosition = undefined;
    job.startedAt = timestamp;
    job.updatedAt = timestamp;
    persist(path, state, now);
    return { ...job };
  });
}

export function updateRenderQueueJob(
  path: string,
  jobId: string,
  patch: Partial<PersistedRenderQueueJob>,
  options: QueueOptions = {},
) {
  const now = options.now ?? (() => new Date());
  return withQueueLock(path, (state) => {
    const job = state.jobs.find((item) => item.jobId === jobId);
    if (!job) return null;
    const immutable = {
      schemaVersion: job.schemaVersion,
      jobId: job.jobId,
      projectId: job.projectId,
      briefPath: job.briefPath,
      queuedAt: job.queuedAt,
    };
    Object.assign(job, patch, immutable, { updatedAt: now().toISOString() });
    persist(path, state, now);
    return { ...job };
  });
}

export function heartbeatRenderQueueWorker(
  path: string,
  workerPid: number,
  options: QueueOptions = {},
) {
  const now = options.now ?? (() => new Date());
  return withQueueLock(path, (state) => {
    if (state.worker?.pid !== workerPid) return false;
    state.worker.heartbeatAt = now().toISOString();
    persist(path, state, now);
    return true;
  });
}

export function releaseRenderQueueWorker(
  path: string,
  workerPid: number,
  options: QueueOptions = {},
) {
  const now = options.now ?? (() => new Date());
  return withQueueLock(path, (state) => {
    if (state.worker?.pid !== workerPid) return false;
    if (state.jobs.some((job) => ACTIVE_STATES.has(job.state))) return false;
    state.worker = null;
    persist(path, state, now);
    return true;
  });
}

export function cancelRenderQueueJob(
  path: string,
  jobId: string,
  options: QueueOptions = {},
) {
  const now = options.now ?? (() => new Date());
  return withQueueLock(path, (state) => {
    const job = state.jobs.find((item) => item.jobId === jobId);
    if (!job || !ACTIVE_STATES.has(job.state)) return null;
    const timestamp = now().toISOString();
    job.cancelRequestedAt = timestamp;
    job.updatedAt = timestamp;
    if (job.state === 'queued') {
      job.state = 'cancelled';
      job.stage = 'completed';
      job.completedAt = timestamp;
    } else {
      job.state = 'cancelling';
    }
    persist(path, state, now);
    return { ...job };
  });
}
