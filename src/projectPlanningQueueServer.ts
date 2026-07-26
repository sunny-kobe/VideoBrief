import { resolve } from 'node:path';

import {
  automaticSourceReadiness,
  materialReviewReadiness,
  sourceIdsRequiringAutomaticProcessing,
} from './productionReadiness';
import { signalProcessTree } from './renderProcessRegistry';
import {
  cancelProjectPlanningJob,
  DEFAULT_PROJECT_PLANNING_QUEUE_PATH,
  enqueueProjectPlanningJob,
  latestProjectPlanningJob,
  projectPlanningJobsForProject,
} from './projectPlanningQueue';
import { ensureProjectPlanningQueueWorker } from './projectPlanningQueueWorkerClient';
import { projectPaths, readBrief } from './shortVideoProjectServer';
import { assertPreproductionGates } from '../scripts/lib/production-workflow-contract.mjs';

const activeStates = new Set(['queued', 'running', 'cancelling']);

export function enqueueProjectPlanning(projectId: string, instruction = '') {
  const project = readBrief(projectId);
  assertPreproductionGates(project);
  if (!project.sources.length) throw new Error('请先导入至少一份素材。');
  const materialReadiness = materialReviewReadiness(project.materialReview, project.sources);
  if (!materialReadiness.ready) throw new Error(materialReadiness.reason);
  if (sourceIdsRequiringAutomaticProcessing(project.sources).length === 0) {
    const sourceReadiness = automaticSourceReadiness(
      project.sources.map((source) => source.processing.status),
    );
    if (!sourceReadiness.ready) throw new Error(sourceReadiness.reason);
  }
  const queued = enqueueProjectPlanningJob(DEFAULT_PROJECT_PLANNING_QUEUE_PATH, {
    projectId,
    briefPath: projectPaths(project).briefPath,
    instruction,
  });
  ensureProjectPlanningQueueWorker(DEFAULT_PROJECT_PLANNING_QUEUE_PATH);
  return {
    state: 'planning' as const,
    project: readBrief(projectId),
    job: latestProjectPlanningJob(DEFAULT_PROJECT_PLANNING_QUEUE_PATH, projectId),
    created: queued.created,
  };
}

export function projectPlanningStatus(projectId: string) {
  const project = readBrief(projectId);
  const jobs = projectPlanningJobsForProject(DEFAULT_PROJECT_PLANNING_QUEUE_PATH, projectId);
  if (jobs.some((job) => activeStates.has(job.state))) {
    ensureProjectPlanningQueueWorker(DEFAULT_PROJECT_PLANNING_QUEUE_PATH);
  }
  return {
    project,
    job: jobs.at(-1) ?? null,
    jobs,
  };
}

export function cancelProjectPlanning(projectId: string) {
  readBrief(projectId);
  const current = latestProjectPlanningJob(DEFAULT_PROJECT_PLANNING_QUEUE_PATH, projectId);
  if (!current || !activeStates.has(current.state)) throw new Error('当前没有可取消的策划任务。');
  const cancelled = cancelProjectPlanningJob(DEFAULT_PROJECT_PLANNING_QUEUE_PATH, current.jobId);
  if (cancelled?.processId && cancelled.state === 'cancelling') {
    signalProcessTree(cancelled.processId, 'SIGTERM');
  }
  return {
    project: readBrief(projectId),
    job: latestProjectPlanningJob(DEFAULT_PROJECT_PLANNING_QUEUE_PATH, projectId),
  };
}

export function projectPlanningJobMirrorPath(projectId: string) {
  const project = readBrief(projectId);
  return resolve(project.outputs.workDir, 'planning-job.json');
}
