import { spawnSync } from 'node:child_process';
import { existsSync, renameSync, writeFileSync } from 'node:fs';

import {
  fileSha256,
  readExportPackageReceipt,
} from './exportPackage';
import {
  packageContentFingerprint,
} from '../scripts/lib/production-content-fingerprint.mjs';
import {
  applyProductionWorkflowAction,
  nextProductionWorkflowAutomaticAction,
  productionWorkflowSnapshot,
  type ProductionWorkflowAction,
  type ProductionWorkflowAutomaticFailure,
  type WorkflowRuntimeEvidence,
} from './productionWorkflow';
import { runWorkflowUntilGate } from './productionWorkflowRunner';
import {
  enqueueProjectPlanning,
  projectPlanningStatus,
} from './projectPlanningQueueServer';
import {
  prepareProjectSourcesForAutomaticProduction,
  projectSourceProcessingStatus,
} from './sourceProcessingQueueServer';
import {
  DEFAULT_RENDER_QUEUE_PATH,
  enqueueRenderQueueJob,
  latestRenderQueueJobForProject,
} from './renderQueue';
import { ensureRenderQueueWorker } from './renderQueueWorkerClient';
import {
  projectFingerprint,
  projectPaths,
  projectProductionContentFingerprint,
  readBrief,
  readRenderManifest,
  renderStatus,
  updateCanonicalProject,
} from './shortVideoProjectServer';

function writeJsonAtomically(path: string, value: unknown) {
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporaryPath, path);
}

function upgradeLegacyArtifactFingerprints(projectId: string) {
  const project = readBrief(projectId);
  const paths = projectPaths(project);
  const manifest = readRenderManifest(paths.manifestPath);
  if (!manifest || manifest.productionContentFingerprint) return;
  if (manifest.projectFingerprint !== projectFingerprint(projectId)) return;

  const contentFingerprint = projectProductionContentFingerprint(projectId);
  const upgradedManifest = { ...manifest, productionContentFingerprint: contentFingerprint };
  writeJsonAtomically(paths.manifestPath, upgradedManifest);

  const receipt = readExportPackageReceipt(paths.exportPackageReceiptPath);
  if (!receipt || receipt.projectFingerprint !== manifest.projectFingerprint) return;
  writeJsonAtomically(paths.exportPackageReceiptPath, {
    ...receipt,
    productionContentFingerprint: contentFingerprint,
    packageContentFingerprint: packageContentFingerprint(project),
    renderManifestSha256: fileSha256(paths.manifestPath),
  });
}

export function workflowRuntimeEvidence(projectId: string): WorkflowRuntimeEvidence {
  const project = readBrief(projectId);
  const paths = projectPaths(project);
  const manifest = readRenderManifest(paths.manifestPath);
  const status = renderStatus(manifest, projectId);
  const videoPath = manifest?.artifacts.publicRender ?? manifest?.artifacts.outputVideo ?? '';
  return {
    renderState: status.state,
    acceptancePassed: status.state === 'ready',
    packageReady: status.packageReady === true,
    videoSha256: videoPath && existsSync(videoPath) ? fileSha256(videoPath) : '',
    packageSha256: status.packageReady && existsSync(paths.exportZipPath) ? fileSha256(paths.exportZipPath) : '',
  };
}

export function readProductionWorkflow(projectId: string) {
  const project = readBrief(projectId);
  const runtime = workflowRuntimeEvidence(projectId);
  const sourceJobs = projectSourceProcessingStatus(projectId).jobs;
  const planningJob = projectPlanningStatus(projectId).job;
  const renderJob = latestRenderQueueJobForProject(DEFAULT_RENDER_QUEUE_PATH, projectId);
  const activeSourceJobs = sourceJobs.filter((job) => ['queued', 'running', 'cancelling'].includes(job.state));
  const activity = activeSourceJobs.length > 0
    ? {
        action: 'process_sources' as const,
        state: activeSourceJobs.some((job) => job.state === 'running') ? 'running' : activeSourceJobs[0].state,
        message: `正在处理 ${activeSourceJobs.length} 份来源。`,
      }
    : planningJob && ['queued', 'running', 'cancelling'].includes(planningJob.state)
      ? { action: 'plan_project' as const, state: planningJob.state, message: '正在生成叙事与镜头候选。' }
      : renderJob && ['queued', 'running', 'cancelling'].includes(renderJob.state)
        ? { action: 'render' as const, state: renderJob.state, message: '正在渲染并执行技术验收。' }
      : null;
  const snapshot = productionWorkflowSnapshot(project, runtime);
  let failure: ProductionWorkflowAutomaticFailure | null = null;
  if (!activity) {
    const latestSourceJobs = new Map<string, (typeof sourceJobs)[number]>();
    for (const job of sourceJobs) latestSourceJobs.set(job.sourceId, job);
    const failedSourceJobs = [...latestSourceJobs.values()].filter((job) => (
      job.state === 'failed' || job.state === 'cancelled'
    ));
    if (failedSourceJobs.length > 0 && project.sources.some((source) => source.processing.status === 'failed')) {
      const latest = failedSourceJobs.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      failure = {
        action: 'process_sources',
        message: latest.error || `来源 ${latest.sourceId} 的内容理解未完成。`,
        failedAt: latest.completedAt || latest.updatedAt,
      };
    } else if (snapshot.automaticAction === 'plan_project' && planningJob
      && (planningJob.state === 'failed' || planningJob.state === 'cancelled')) {
      failure = {
        action: 'plan_project',
        message: planningJob.error || '叙事与镜头策划任务未完成。',
        failedAt: planningJob.completedAt || planningJob.updatedAt,
      };
    } else if (snapshot.automaticAction === 'render' && renderJob
      && (renderJob.state === 'failed' || renderJob.state === 'cancelled')) {
      failure = {
        action: 'render',
        message: renderJob.error || '渲染任务未完成。',
        failedAt: renderJob.completedAt || renderJob.updatedAt,
      };
    }
  }
  return {
    project,
    workflow: {
      ...snapshot,
      activity,
      failure,
    },
  };
}

export function recordProductionWorkflowAction(projectId: string, action: ProductionWorkflowAction) {
  upgradeLegacyArtifactFingerprints(projectId);
  const runtime = workflowRuntimeEvidence(projectId);
  const project = updateCanonicalProject(
    projectId,
    (current) => applyProductionWorkflowAction(current, runtime, action),
    { markRenderStale: false },
  );
  return { project, workflow: productionWorkflowSnapshot(project, workflowRuntimeEvidence(projectId)) };
}

function enqueueWorkflowRender(projectId: string) {
  const active = latestRenderQueueJobForProject(DEFAULT_RENDER_QUEUE_PATH, projectId);
  if (active && ['queued', 'running', 'cancelling'].includes(active.state)) return active;
  const project = readBrief(projectId);
  const paths = projectPaths(project);
  const queued = enqueueRenderQueueJob(DEFAULT_RENDER_QUEUE_PATH, {
    projectId,
    briefPath: paths.briefPath,
  });
  ensureRenderQueueWorker(DEFAULT_RENDER_QUEUE_PATH);
  return queued.job;
}

function buildWorkflowPackage(projectId: string) {
  const project = readBrief(projectId);
  const result = spawnSync(process.execPath, [
    'scripts/build-export-package.mjs',
    `--brief=${projectPaths(project).briefPath}`,
  ], { cwd: process.cwd(), encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || 'Production package 生成失败').trim());
  }
}

export function advanceProductionWorkflow(projectId: string, instruction = '') {
  upgradeLegacyArtifactFingerprints(projectId);
  const project = readBrief(projectId);
  const runtime = workflowRuntimeEvidence(projectId);
  const action = nextProductionWorkflowAutomaticAction(project, runtime);

  if (action === 'process_sources') {
    const result = prepareProjectSourcesForAutomaticProduction(projectId);
    return { state: result.state, action, jobs: result.jobs, ...readProductionWorkflow(projectId) };
  }
  if (action === 'plan_project') {
    const result = enqueueProjectPlanning(projectId, instruction);
    return { state: result.state, action, job: result.job, ...readProductionWorkflow(projectId) };
  }
  if (action === 'render') {
    const job = enqueueWorkflowRender(projectId);
    return { state: 'rendering' as const, action, job, ...readProductionWorkflow(projectId) };
  }
  if (action === 'package') {
    buildWorkflowPackage(projectId);
    return { state: 'packaged' as const, action, ...readProductionWorkflow(projectId) };
  }
  const current = readProductionWorkflow(projectId);
  return {
    state: current.workflow.next?.responsibility === 'human_gate' ? 'awaiting_human' as const : 'idle' as const,
    action: null,
    ...current,
  };
}

export async function runProductionWorkflowUntilGate(
  projectId: string,
  options: {
    instruction?: string;
    pollIntervalMs?: number;
    timeoutMs?: number;
    onProgress?: (message: string) => void;
  } = {},
) {
  const pollIntervalMs = Math.max(100, options.pollIntervalMs ?? 1_000);
  const timeoutMs = Math.max(pollIntervalMs, options.timeoutMs ?? 30 * 60_000);
  const deadline = Date.now() + timeoutMs;
  const sleep = () => new Promise((resolvePromise) => setTimeout(resolvePromise, pollIntervalMs));

  return runWorkflowUntilGate({
    read: async () => readProductionWorkflow(projectId),
    advance: async () => advanceProductionWorkflow(projectId, options.instruction),
    waitForActivity: async () => {
      while (Date.now() <= deadline) {
        const current = readProductionWorkflow(projectId);
        if (current.workflow.failure) {
          throw new Error(`${current.workflow.failure.action} 失败：${current.workflow.failure.message}`);
        }
        if (!current.workflow.activity) return;
        options.onProgress?.(current.workflow.activity.message);
        await sleep();
      }
      throw new Error(`自动生产等待超过 ${Math.round(timeoutMs / 1_000)} 秒。`);
    },
    onProgress: options.onProgress,
  });
}
