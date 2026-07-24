import { resolve } from 'node:path';

import {
  automaticSourceReadiness,
  sourceIdsRequiringAutomaticProcessing,
} from './productionReadiness';
import { signalProcessTree } from './renderProcessRegistry';
import {
  cancelSourceProcessingJob,
  DEFAULT_SOURCE_PROCESSING_QUEUE_PATH,
  enqueueSourceProcessingJob,
  latestSourceProcessingJob,
  sourceProcessingJobsForProject,
} from './sourceProcessingQueue';
import { ensureSourceProcessingQueueWorker } from './sourceProcessingQueueWorkerClient';
import { markProjectSourceProcessingInterrupted } from './sourceProcessingServer';
import { projectPaths, readBrief, updateCanonicalProject } from './shortVideoProjectServer';

const activeStates = new Set(['queued', 'running', 'cancelling']);

export function enqueueProjectSourceProcessing(projectId: string, sourceIds: string[]) {
  const project = readBrief(projectId);
  const knownIds = new Set(project.sources.map((source) => source.id));
  const uniqueIds = [...new Set(sourceIds)];
  for (const sourceId of uniqueIds) {
    if (!knownIds.has(sourceId)) throw new Error(`Source not found: ${sourceId}`);
  }
  const briefPath = projectPaths(project).briefPath;
  const queued = uniqueIds.map((sourceId) => enqueueSourceProcessingJob(
    DEFAULT_SOURCE_PROCESSING_QUEUE_PATH,
    { projectId, sourceId, briefPath },
  ));
  const createdIds = new Set(queued.filter((item) => item.created).map((item) => item.job.sourceId));
  if (createdIds.size) {
    updateCanonicalProject(projectId, (current) => ({
      ...current,
      sources: current.sources.map((source) => createdIds.has(source.id) ? {
        ...source,
        processing: {
          ...source.processing,
          status: 'pending',
          stage: 'idle',
          completedAt: '',
          error: '',
        },
      } : source),
    }));
  }
  ensureSourceProcessingQueueWorker(DEFAULT_SOURCE_PROCESSING_QUEUE_PATH);
  return {
    project: readBrief(projectId),
    jobs: uniqueIds.map((sourceId) => latestSourceProcessingJob(
      DEFAULT_SOURCE_PROCESSING_QUEUE_PATH,
      projectId,
      sourceId,
    )).filter(Boolean),
  };
}

export function projectSourceProcessingStatus(projectId: string) {
  const project = readBrief(projectId);
  const jobs = sourceProcessingJobsForProject(DEFAULT_SOURCE_PROCESSING_QUEUE_PATH, projectId);
  if (jobs.some((job) => activeStates.has(job.state))) {
    ensureSourceProcessingQueueWorker(DEFAULT_SOURCE_PROCESSING_QUEUE_PATH);
  }
  return { project, jobs };
}

export function prepareProjectSourcesForAutomaticProduction(projectId: string) {
  const project = readBrief(projectId);
  if (!project.sources.length) throw new Error('请先导入至少一份素材。');
  const sourceIds = sourceIdsRequiringAutomaticProcessing(project.sources);
  if (sourceIds.length) {
    return {
      state: 'processing_sources' as const,
      ...enqueueProjectSourceProcessing(projectId, sourceIds),
    };
  }
  const readiness = automaticSourceReadiness(
    project.sources.map((source) => source.processing.status),
  );
  if (!readiness.ready) throw new Error(readiness.reason);
  return {
    state: 'ready' as const,
    project,
    jobs: sourceProcessingJobsForProject(DEFAULT_SOURCE_PROCESSING_QUEUE_PATH, projectId),
  };
}

export function cancelProjectSourceProcessing(projectId: string, sourceId: string) {
  readBrief(projectId);
  const current = latestSourceProcessingJob(
    DEFAULT_SOURCE_PROCESSING_QUEUE_PATH,
    projectId,
    sourceId,
  );
  if (!current || !activeStates.has(current.state)) {
    throw new Error('当前来源没有可取消的处理任务。');
  }
  const next = cancelSourceProcessingJob(DEFAULT_SOURCE_PROCESSING_QUEUE_PATH, current.jobId);
  if (!next) throw new Error('来源处理任务已经结束。');
  if (next.state === 'cancelled') {
    markProjectSourceProcessingInterrupted(projectId, sourceId, '资料处理已取消；已完成章节已保留，可重新处理。');
  } else if (next.processId) {
    signalProcessTree(next.processId, 'SIGTERM');
  }
  ensureSourceProcessingQueueWorker(DEFAULT_SOURCE_PROCESSING_QUEUE_PATH);
  return {
    project: readBrief(projectId),
    job: latestSourceProcessingJob(DEFAULT_SOURCE_PROCESSING_QUEUE_PATH, projectId, sourceId),
  };
}

export function sourceProcessingQueuePath() {
  return resolve(DEFAULT_SOURCE_PROCESSING_QUEUE_PATH);
}
