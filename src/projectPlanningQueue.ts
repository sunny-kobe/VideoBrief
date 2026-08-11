import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import {
  isProcessAlive as defaultIsProcessAlive,
  readJsonFile,
  withJsonFileLock,
  writeAtomicJson,
} from './persistentJsonQueue';

export const DEFAULT_PROJECT_PLANNING_QUEUE_PATH = resolve('output/project-planning-queue/queue.json');

export type ProjectPlanningJobState = 'queued' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed';
export type ProjectPlanningJobStage = 'queued' | 'waiting_sources' | 'narrative' | 'candidates' | 'assets' | 'completed';

export interface PersistedProjectPlanningJob {
  schemaVersion: 1;
  jobId: string;
  projectId: string;
  briefPath: string;
  instruction: string;
  state: ProjectPlanningJobState;
  stage: ProjectPlanningJobStage;
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

interface ProjectPlanningQueueState {
  schemaVersion: 1;
  updatedAt: string;
  worker: { pid: number; startedAt: string; heartbeatAt: string } | null;
  jobs: PersistedProjectPlanningJob[];
}

interface QueueOptions {
  now?: () => Date;
  isProcessAlive?: (pid: number) => boolean;
}

const ACTIVE_STATES = new Set<ProjectPlanningJobState>(['queued', 'running', 'cancelling']);

function emptyQueue(): ProjectPlanningQueueState {
  return { schemaVersion: 1, updatedAt: '', worker: null, jobs: [] };
}

function parseQueue(path: string): ProjectPlanningQueueState {
  return readJsonFile(path, emptyQueue, (raw) => {
    const value = raw as Partial<ProjectPlanningQueueState>;
    if (value.schemaVersion !== 1 || !Array.isArray(value.jobs)) {
      throw new Error(`Invalid project planning queue: ${path}`);
    }
    return {
      schemaVersion: 1,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
      worker: value.worker && Number.isInteger(value.worker.pid) ? value.worker : null,
      jobs: value.jobs as PersistedProjectPlanningJob[],
    };
  });
}

function persist(path: string, state: ProjectPlanningQueueState, now: () => Date) {
  state.updatedAt = now().toISOString();
  writeAtomicJson(path, state);
}

function withQueueLock<T>(path: string, action: (state: ProjectPlanningQueueState) => T) {
  return withJsonFileLock(path, () => action(parseQueue(path)));
}

function withQueuePositions(jobs: PersistedProjectPlanningJob[]) {
  let position = 0;
  return jobs.map((job) => {
    if (job.state !== 'queued') return { ...job, queuePosition: undefined };
    position += 1;
    return { ...job, queuePosition: position };
  });
}

export function listProjectPlanningJobs(path = DEFAULT_PROJECT_PLANNING_QUEUE_PATH) {
  return withQueuePositions(parseQueue(path).jobs);
}

export function removeProjectPlanningJobsForProject(
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

export function projectPlanningQueueWorker(
  path = DEFAULT_PROJECT_PLANNING_QUEUE_PATH,
  options: Pick<QueueOptions, 'isProcessAlive'> = {},
) {
  const worker = parseQueue(path).worker;
  if (!worker) return null;
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  return { ...worker, alive: isProcessAlive(worker.pid) };
}

export function getProjectPlanningJob(path: string, jobId: string) {
  return listProjectPlanningJobs(path).find((job) => job.jobId === jobId) ?? null;
}

export function latestProjectPlanningJob(path: string, projectId: string) {
  const jobs = listProjectPlanningJobs(path);
  for (let index = jobs.length - 1; index >= 0; index -= 1) {
    if (jobs[index].projectId === projectId) return jobs[index];
  }
  return null;
}

export function projectPlanningJobsForProject(path: string, projectId: string) {
  return listProjectPlanningJobs(path).filter((job) => job.projectId === projectId);
}

export function nextQueuedProjectPlanningJob(path = DEFAULT_PROJECT_PLANNING_QUEUE_PATH) {
  return listProjectPlanningJobs(path).find((job) => job.state === 'queued') ?? null;
}

export function activeProjectPlanningJobForWorker(path: string, workerPid: number) {
  return listProjectPlanningJobs(path).find((job) => (
    job.workerPid === workerPid && ['running', 'cancelling'].includes(job.state)
  )) ?? null;
}

export function enqueueProjectPlanningJob(
  path: string,
  input: { projectId: string; briefPath: string; instruction?: string },
  options: QueueOptions & { resumedFromJobId?: string } = {},
) {
  const now = options.now ?? (() => new Date());
  return withQueueLock(path, (state) => {
    const existing = state.jobs.find((job) => (
      job.projectId === input.projectId && ACTIVE_STATES.has(job.state)
    ));
    if (existing) {
      return {
        created: false,
        job: withQueuePositions(state.jobs).find((job) => job.jobId === existing.jobId)!,
      };
    }
    const timestamp = now().toISOString();
    const job: PersistedProjectPlanningJob = {
      schemaVersion: 1,
      jobId: randomUUID(),
      projectId: input.projectId,
      briefPath: resolve(input.briefPath),
      instruction: String(input.instruction ?? '').trim().slice(0, 2_000),
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

export function acquireProjectPlanningQueueWorker(
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

export function claimNextProjectPlanningJob(
  path: string,
  workerPid: number,
  options: QueueOptions & { processId?: number } = {},
) {
  const now = options.now ?? (() => new Date());
  return withQueueLock(path, (state) => {
    if (state.jobs.some((job) => ['running', 'cancelling'].includes(job.state))) return null;
    const job = state.jobs.find((item) => item.state === 'queued');
    if (!job) return null;
    const timestamp = now().toISOString();
    job.state = 'running';
    job.stage = 'waiting_sources';
    job.workerPid = workerPid;
    job.processId = options.processId;
    job.startedAt = timestamp;
    job.updatedAt = timestamp;
    persist(path, state, now);
    return { ...job };
  });
}

export function updateProjectPlanningJob(
  path: string,
  jobId: string,
  patch: Partial<PersistedProjectPlanningJob>,
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
      instruction: job.instruction,
      queuedAt: job.queuedAt,
    };
    Object.assign(job, patch, immutable, { updatedAt: now().toISOString() });
    persist(path, state, now);
    return { ...job };
  });
}

export function heartbeatProjectPlanningQueueWorker(
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

export function releaseProjectPlanningQueueWorker(
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

export function cancelProjectPlanningJob(
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
