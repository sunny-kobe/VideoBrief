import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { renderAcceptanceState } from './renderAcceptance';
import {
  deriveProjectDisplayStage,
  projectNextHref,
  type ProjectDisplayStage,
  type ProjectQueueEvidence,
} from './projectLifecycle';
import { projectStorageContext, type ProjectStorageContext } from './projectLifecycleServer';
import { listProjectPlanningJobs } from './projectPlanningQueue';
import { productionWorkflowSnapshot } from './productionWorkflow';
import { listRenderQueueJobs } from './renderQueue';
import { listSourceProcessingJobs } from './sourceProcessingQueue';
import { normalizeBrief } from './shortVideoProjectServer';
import type {
  MarketStatus,
  ProjectRightsStatus,
  PublicationStatus,
  ShortVideoProject,
  ShortVideoRenderManifest,
  WorkbenchRenderStatus,
} from './shortVideoBrief';
import { productionContentFingerprint } from '../scripts/lib/production-content-fingerprint.mjs';
import {
  renditionBundleFingerprint,
  resolveProjectRenditions,
} from '../scripts/lib/video-renditions.mjs';

export interface ProjectHomeEntry {
  id: string;
  title: string;
  coreMessage: string;
  updatedAt: string;
  stage: ProjectDisplayStage;
  stageLabel: string;
  primaryStage: string;
  issue: string;
  nextAction: string;
  nextHref: string;
  rightsStatus: ProjectRightsStatus;
  publicationStatus: PublicationStatus;
  marketStatus: MarketStatus;
  workflowOrigin: 'manual' | 'daily_signal' | 'legacy';
  lifecycleState: 'active' | 'archived';
  archiveReason: string;
  damaged: false;
}

export interface DamagedProjectHomeEntry {
  id: string;
  title: string;
  coreMessage: string;
  updatedAt: string;
  stage: 'needs_attention';
  stageLabel: string;
  primaryStage: string;
  issue: string;
  nextAction: string;
  nextHref: string;
  rightsStatus: 'review_required';
  publicationStatus: 'draft-unpublished';
  marketStatus: 'none';
  workflowOrigin: 'legacy';
  lifecycleState: 'active';
  archiveReason: string;
  damaged: true;
}

export type ProjectHomeListEntry = ProjectHomeEntry | DamagedProjectHomeEntry;

function safePath(context: ProjectStorageContext, path: string, roots: string[]) {
  const absolute = resolve(context.rootDir, path);
  return roots.some((root) => absolute.startsWith(`${root}${sep}`)) ? absolute : '';
}

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function renditionStatus(
  context: ProjectStorageContext,
  project: ShortVideoProject,
  rendition: ReturnType<typeof resolveProjectRenditions>[number],
  rawFingerprint: string,
) {
  const readableRoots = [
    resolve(context.rootDir, 'output/videos'),
    resolve(context.rootDir, 'output/exports'),
    resolve(context.rootDir, 'public/renders'),
  ];
  const workDir = safePath(context, rendition.workDir, [resolve(context.rootDir, 'output/videos')]);
  const manifestPath = workDir ? join(workDir, 'render-manifest.json') : '';
  if (!manifestPath || !existsSync(manifestPath)) return { state: 'missing' as const, videoSha256: '' };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ShortVideoRenderManifest;
  if (manifest.productionContentFingerprint
    ? manifest.productionContentFingerprint !== productionContentFingerprint(project)
    : manifest.projectFingerprint !== rawFingerprint) {
    return { state: 'stale' as const, videoSha256: '' };
  }
  if (!manifest.proof?.passed) return { state: 'unverified' as const, videoSha256: '' };
  const artifactsExist = Object.values(manifest.artifacts).every((declared) => {
    if (declared == null) return true;
    const path = safePath(context, declared, readableRoots);
    return Boolean(path && existsSync(path) && lstatSync(path).size > 0);
  });
  if (!artifactsExist) return { state: 'unverified' as const, videoSha256: '' };
  const videoPath = safePath(
    context,
    manifest.artifacts.publicRender ?? manifest.artifacts.outputVideo,
    readableRoots,
  );
  if (!videoPath || !existsSync(videoPath)) return { state: 'unverified' as const, videoSha256: '' };
  const videoSha256 = sha256(videoPath);
  return { state: renderAcceptanceState(manifest.acceptance, videoSha256), videoSha256 };
}

function renderOverview(context: ProjectStorageContext, project: ShortVideoProject, rawFingerprint: string) {
  const statuses = resolveProjectRenditions(project).map((rendition) => ({
    rendition,
    ...renditionStatus(context, project, rendition, rawFingerprint),
  }));
  const state = statuses.every((item) => item.state === 'ready')
    ? 'ready'
    : statuses.find((item) => item.state === 'review_failed')?.state
      ?? statuses.find((item) => item.state === 'awaiting_semantic')?.state
      ?? statuses.find((item) => item.state === 'awaiting_browser')?.state
      ?? statuses.find((item) => item.state === 'unverified')?.state
      ?? statuses.find((item) => item.state === 'stale')?.state
      ?? 'missing';
  const labels: Record<typeof state, string> = {
    missing: '尚未渲染',
    stale: '成片已过期',
    unverified: '等待技术检查',
    awaiting_semantic: '等待内容验收',
    awaiting_browser: '等待浏览器验收',
    review_failed: '成片验收未通过',
    ready: '自动验收通过',
  };
  const render: WorkbenchRenderStatus = { state, label: labels[state], message: labels[state] };
  const zipPath = safePath(
    context,
    `${project.outputs.exportDir}.zip`,
    [resolve(context.rootDir, 'output/exports')],
  );
  return {
    render,
    runtime: {
      renderState: state,
      acceptancePassed: state === 'ready',
      packageReady: Boolean(zipPath && existsSync(zipPath)),
      videoSha256: renditionBundleFingerprint(statuses.map((item) => ({
        id: item.rendition.id,
        videoSha256: item.videoSha256,
      }))),
      packageSha256: '',
    },
  };
}

function latestProjectJob<T extends { projectId: string; updatedAt: string }>(jobs: T[], projectId: string) {
  return jobs.filter((job) => job.projectId === projectId)
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .at(-1);
}

function queueEvidence(context: ProjectStorageContext, projectId: string): ProjectQueueEvidence[] {
  const sourceJobs = listSourceProcessingJobs(context.sourceProcessingQueuePath)
    .filter((job) => job.projectId === projectId);
  const latestSources = [...new Map(sourceJobs.map((job) => [job.sourceId, job])).values()];
  const planning = latestProjectJob(listProjectPlanningJobs(context.projectPlanningQueuePath), projectId);
  const render = latestProjectJob(listRenderQueueJobs(context.renderQueuePath), projectId);
  return [
    ...latestSources.map((job) => ({ kind: 'source-processing' as const, state: job.state, error: job.error })),
    ...(planning ? [{ kind: 'project-planning' as const, state: planning.state, error: planning.error }] : []),
    ...(render ? [{ kind: 'render' as const, state: render.state, error: render.error }] : []),
  ];
}

function entryForProject(
  context: ProjectStorageContext,
  project: ShortVideoProject,
  updatedAt: string,
  rawFingerprint: string,
): ProjectHomeEntry {
  const { render, runtime } = renderOverview(context, project, rawFingerprint);
  const workflow = productionWorkflowSnapshot(project, runtime);
  const queues = queueEvidence(context, project.id);
  const decision = deriveProjectDisplayStage({
    project,
    render,
    workflowStages: workflow.stages,
    workflowFailure: null,
    queues,
  });
  const activeQueue = queues.find((queue) => ['queued', 'running', 'cancelling'].includes(queue.state));
  const nextStage = workflow.stages.find((stage) => stage.id === decision.nextWorkflowStage);
  return {
    id: project.id,
    title: project.title,
    coreMessage: project.brief.coreMessage,
    updatedAt: project.production.updatedAt || updatedAt,
    stage: decision.stage,
    stageLabel: decision.stage === 'in_progress' && activeQueue
      ? `${activeQueue.kind === 'render' ? '渲染' : activeQueue.kind === 'project-planning' ? '策划' : '来源处理'}中`
      : decision.stage === 'needs_attention' ? '需处理' : decision.stage === 'awaiting_review' ? '待审片' : decision.stage === 'completed' ? '已完成' : '已归档',
    primaryStage: decision.stage === 'completed'
      ? '成片已批准'
      : decision.stage === 'archived'
        ? '项目已归档'
        : nextStage?.label || render.label,
    issue: decision.issue,
    nextAction: decision.nextAction,
    nextHref: projectNextHref(project.id, decision),
    rightsStatus: project.rights_status,
    publicationStatus: project.publication_status,
    marketStatus: project.market_status,
    workflowOrigin: project.workflow.origin.kind,
    lifecycleState: project.lifecycle?.state === 'archived' ? 'archived' : 'active',
    archiveReason: project.lifecycle?.archiveReason ?? '',
    damaged: false,
  };
}

export function listProjectHomeEntries(options: Partial<ProjectStorageContext> = {}): ProjectHomeListEntry[] {
  const context = projectStorageContext(options);
  if (!existsSync(context.projectsRoot)) return [];
  return readdirSync(context.projectsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap<ProjectHomeListEntry>((entry) => {
      const path = join(context.projectsRoot, entry.name, 'project.json');
      if (!existsSync(path)) return [];
      const stat = lstatSync(path);
      try {
        const rawText = readFileSync(path, 'utf8');
        const project = normalizeBrief(JSON.parse(rawText));
        const rawFingerprint = createHash('sha256').update(rawText).digest('hex');
        return [entryForProject(context, project, stat.mtime.toISOString(), rawFingerprint)];
      } catch (error) {
        return [{
          id: entry.name,
          title: entry.name,
          coreMessage: '',
          updatedAt: stat.mtime.toISOString(),
          stage: 'needs_attention' as const,
          stageLabel: '损坏项目',
          primaryStage: '项目文件无法读取',
          issue: error instanceof Error ? error.message : 'project.json 无法解析。',
          nextAction: '无法打开',
          nextHref: '',
          rightsStatus: 'review_required' as const,
          publicationStatus: 'draft-unpublished' as const,
          marketStatus: 'none' as const,
          workflowOrigin: 'legacy' as const,
          lifecycleState: 'active' as const,
          archiveReason: '',
          damaged: true as const,
        }];
      }
    });
}
