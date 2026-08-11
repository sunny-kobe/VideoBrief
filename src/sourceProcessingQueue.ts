import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import {
  isProcessAlive as defaultIsProcessAlive,
  readJsonFile,
  withJsonFileLock,
  writeAtomicJson,
} from './persistentJsonQueue';

export const DEFAULT_SOURCE_PROCESSING_QUEUE_PATH = resolve('output/source-processing-queue/queue.json');

export type SourceProcessingJobState = 'queued' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed';
export type SourceProcessingJobStage =
  | 'queued'
  | 'local-extraction'
  | 'transcription'
  | 'vision'
  | 'fact-extraction'
  | 'hierarchy'
  | 'completed';

export interface PersistedSourceProcessingJob {
  schemaVersion: 1;
  jobId: string;
  projectId: string;
  sourceId: string;
  briefPath: string;
  state: SourceProcessingJobState;
  stage: SourceProcessingJobStage;
  queuedAt: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string;
  error: string;
  queuePosition?: number;
  workerPid?: number;
  processId?: number;
  cancelRequestedAt?: string;
  resumedFromJobId?: string;
}

interface SourceProcessingQueueWorkerRecord {
  pid: number;
  startedAt: string;
  heartbeatAt: string;
}

interface SourceProcessingQueueState {
  schemaVersion: 1;
  updatedAt: string;
  worker: SourceProcessingQueueWorkerRecord | null;
  jobs: PersistedSourceProcessingJob[];
}

interface QueueOptions {
  now?: () => Date;
  isProcessAlive?: (pid: number) => boolean;
}

interface EnqueueOptions extends QueueOptions {
  resumedFromJobId?: string;
}

const ACTIVE_STATES = new Set<SourceProcessingJobState>(['queued', 'running', 'cancelling']);

function emptyQueue(): SourceProcessingQueueState {
  return { schemaVersion: 1, updatedAt: '', worker: null, jobs: [] };
}

function parseQueue(path: string): SourceProcessingQueueState {
  return readJsonFile(path, emptyQueue, (raw) => {
    const value = raw as Partial<SourceProcessingQueueState>;
    if (value.schemaVersion !== 1 || !Array.isArray(value.jobs)) {
      throw new Error(`Invalid source processing queue: ${path}`);
    }
    return {
      schemaVersion: 1,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
      worker: value.worker && Number.isInteger(value.worker.pid)
        ? value.worker as SourceProcessingQueueWorkerRecord
        : null,
      jobs: value.jobs as PersistedSourceProcessingJob[],
    };
  });
}

function withQueueLock<T>(path: string, action: (state: SourceProcessingQueueState) => T) {
  return withJsonFileLock(path, () => action(parseQueue(path)));
}

function persist(path: string, state: SourceProcessingQueueState, now: () => Date) {
  state.updatedAt = now().toISOString();
  writeAtomicJson(path, state);
}

function withQueuePositions(jobs: PersistedSourceProcessingJob[]) {
  let queuePosition = 0;
  return jobs.map((job) => {
    if (job.state !== 'queued') return { ...job, queuePosition: undefined };
    queuePosition += 1;
    return { ...job, queuePosition };
  });
}

export function listSourceProcessingJobs(path = DEFAULT_SOURCE_PROCESSING_QUEUE_PATH) {
  return withQueuePositions(parseQueue(path).jobs);
}

export function removeSourceProcessingJobsForProject(
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

export function sourceProcessingQueueWorker(
  path = DEFAULT_SOURCE_PROCESSING_QUEUE_PATH,
  options: Pick<QueueOptions, 'isProcessAlive'> = {},
) {
  const worker = parseQueue(path).worker;
  if (!worker) return null;
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  return { ...worker, alive: isProcessAlive(worker.pid) };
}

export function getSourceProcessingJob(path: string, jobId: string) {
  return listSourceProcessingJobs(path).find((job) => job.jobId === jobId) ?? null;
}

export function latestSourceProcessingJob(
  path: string,
  projectId: string,
  sourceId: string,
) {
  const jobs = listSourceProcessingJobs(path);
  for (let index = jobs.length - 1; index >= 0; index -= 1) {
    const job = jobs[index];
    if (job.projectId === projectId && job.sourceId === sourceId) return job;
  }
  return null;
}

export function sourceProcessingJobsForProject(path: string, projectId: string) {
  return listSourceProcessingJobs(path).filter((job) => job.projectId === projectId);
}

export function nextQueuedSourceProcessingJob(path = DEFAULT_SOURCE_PROCESSING_QUEUE_PATH) {
  return listSourceProcessingJobs(path).find((job) => job.state === 'queued') ?? null;
}

export function activeSourceProcessingJobForWorker(path: string, workerPid: number) {
  return listSourceProcessingJobs(path).find((job) => (
    job.workerPid === workerPid && ['running', 'cancelling'].includes(job.state)
  )) ?? null;
}

export function enqueueSourceProcessingJob(
  path: string,
  input: { projectId: string; sourceId: string; briefPath: string },
  options: EnqueueOptions = {},
) {
  const now = options.now ?? (() => new Date());
  return withQueueLock(path, (state) => {
    const existing = state.jobs.find((job) => (
      job.projectId === input.projectId
      && job.sourceId === input.sourceId
      && ACTIVE_STATES.has(job.state)
    ));
    if (existing) {
      return {
        created: false,
        job: withQueuePositions(state.jobs).find((job) => job.jobId === existing.jobId)!,
      };
    }
    const timestamp = now().toISOString();
    const job: PersistedSourceProcessingJob = {
      schemaVersion: 1,
      jobId: randomUUID(),
      projectId: input.projectId,
      sourceId: input.sourceId,
      briefPath: resolve(input.briefPath),
      state: 'queued',
      stage: 'queued',
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

export function acquireSourceProcessingQueueWorker(
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
        job.stage = 'queued';
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

export function claimNextSourceProcessingJob(path: string, workerPid: number, options: QueueOptions = {}) {
  const now = options.now ?? (() => new Date());
  return withQueueLock(path, (state) => {
    if (state.jobs.some((job) => ['running', 'cancelling'].includes(job.state))) return null;
    const job = state.jobs.find((item) => item.state === 'queued');
    if (!job) return null;
    const timestamp = now().toISOString();
    job.state = 'running';
    job.stage = 'local-extraction';
    job.workerPid = workerPid;
    job.queuePosition = undefined;
    job.startedAt = timestamp;
    job.updatedAt = timestamp;
    persist(path, state, now);
    return { ...job };
  });
}

export function updateSourceProcessingJob(
  path: string,
  jobId: string,
  patch: Partial<PersistedSourceProcessingJob>,
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
      sourceId: job.sourceId,
      briefPath: job.briefPath,
      queuedAt: job.queuedAt,
    };
    Object.assign(job, patch, immutable, { updatedAt: now().toISOString() });
    persist(path, state, now);
    return { ...job };
  });
}

export function heartbeatSourceProcessingQueueWorker(
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

export function releaseSourceProcessingQueueWorker(
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

export function cancelSourceProcessingJob(
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
