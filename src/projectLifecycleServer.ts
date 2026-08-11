import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import {
  listProjectPlanningJobs,
  removeProjectPlanningJobsForProject,
} from './projectPlanningQueue';
import {
  listRenderQueueJobs,
  removeRenderQueueJobsForProject,
} from './renderQueue';
import {
  listSourceProcessingJobs,
  removeSourceProcessingJobsForProject,
} from './sourceProcessingQueue';
import type {
  ProjectLifecycleAction,
} from './projectLifecycle';
import {
  assertProjectId,
  normalizeBrief,
} from './shortVideoProjectServer';
import type {
  ShortVideoProject,
  ShortVideoRenderManifest,
} from './shortVideoBrief';
import { DEFAULT_PROJECT_ID } from './shortVideoBrief';
import {
  packageContentFingerprint,
  productionContentFingerprint,
} from '../scripts/lib/production-content-fingerprint.mjs';
import { resolveProjectRenditions } from '../scripts/lib/video-renditions.mjs';

const activeQueueStates = new Set(['queued', 'running', 'cancelling']);

export interface ProjectStorageContext {
  rootDir: string;
  projectsRoot: string;
  trashRoot: string;
  renderQueuePath: string;
  sourceProcessingQueuePath: string;
  projectPlanningQueuePath: string;
  referenceRoots: string[];
  systemProjectIds: string[];
  now: () => Date;
}

export interface ProjectDeletionTarget {
  category: string;
  path: string;
  relativePath: string;
  kind: 'file' | 'directory' | 'symlink';
  fileCount: number;
  bytes: number;
}

export interface ProjectDeletionBlocker {
  code: 'active_queue' | 'referenced' | 'unsafe_path' | 'inspection_failed';
  message: string;
  source?: string;
}

export interface ProjectDeletionPlan {
  schemaVersion: 1;
  projectId: string;
  generatedAt: string;
  canDelete: boolean;
  targets: ProjectDeletionTarget[];
  totals: { files: number; bytes: number };
  queueRecords: {
    render: number;
    sourceProcessing: number;
    projectPlanning: number;
  };
  blockers: ProjectDeletionBlocker[];
}

export interface ProjectDeletionReceipt {
  schemaVersion: 1;
  projectId: string;
  deletedAt: string;
  mode: 'trash';
  trashDirectory: string;
  movedTargets: Array<ProjectDeletionTarget & { trashPath: string }>;
  removedQueueRecords: ProjectDeletionPlan['queueRecords'];
  totals: ProjectDeletionPlan['totals'];
}

export class ProjectLifecycleError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ProjectLifecycleError';
  }
}

export function projectStorageContext(options: Partial<ProjectStorageContext> = {}): ProjectStorageContext {
  const configuredRoot = process.env.VIDEOBRIEF_STORAGE_ROOT || process.cwd();
  const rootDir = resolve(options.rootDir ?? configuredRoot);
  return {
    rootDir,
    projectsRoot: resolve(options.projectsRoot ?? join(rootDir, 'content/projects')),
    trashRoot: resolve(options.trashRoot ?? join(rootDir, 'output/project-trash')),
    renderQueuePath: resolve(options.renderQueuePath ?? join(rootDir, 'output/render-queue/queue.json')),
    sourceProcessingQueuePath: resolve(options.sourceProcessingQueuePath ?? join(rootDir, 'output/source-processing-queue/queue.json')),
    projectPlanningQueuePath: resolve(options.projectPlanningQueuePath ?? join(rootDir, 'output/project-planning-queue/queue.json')),
    referenceRoots: options.referenceRoots?.map((path) => resolve(path)) ?? [
      resolve(rootDir, 'content/workflows'),
      resolve(rootDir, 'content/daily-signals'),
      resolve(rootDir, 'tests/fixtures'),
    ],
    systemProjectIds: options.systemProjectIds ?? [DEFAULT_PROJECT_ID],
    now: options.now ?? (() => new Date()),
  };
}

function projectFile(context: ProjectStorageContext, projectId: string) {
  return join(context.projectsRoot, assertProjectId(projectId), 'project.json');
}

function readProject(context: ProjectStorageContext, projectId: string) {
  const path = projectFile(context, projectId);
  if (!existsSync(path)) throw new ProjectLifecycleError('项目不存在。', 404);
  try {
    const rawText = readFileSync(path, 'utf8');
    return {
      path,
      rawText,
      raw: JSON.parse(rawText) as Record<string, unknown>,
      project: normalizeBrief(JSON.parse(rawText)),
    };
  } catch (error) {
    if (error instanceof ProjectLifecycleError) throw error;
    throw new ProjectLifecycleError(`项目文件损坏：${error instanceof Error ? error.message : '无法解析'}`, 422);
  }
}

function writeJsonAtomically(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporaryPath, path);
}

function resolveProjectPath(context: ProjectStorageContext, path: string) {
  return resolve(context.rootDir, path);
}

function manifestPaths(context: ProjectStorageContext, project: ShortVideoProject) {
  return resolveProjectRenditions(project).map((rendition) => (
    join(resolveProjectPath(context, rendition.workDir), 'render-manifest.json')
  ));
}

function upgradeCurrentLegacyManifests(
  context: ProjectStorageContext,
  project: ShortVideoProject,
  rawFingerprint: string,
) {
  const contentFingerprint = productionContentFingerprint(project);
  for (const path of manifestPaths(context, project)) {
    if (!existsSync(path)) continue;
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as ShortVideoRenderManifest;
    if (manifest.productionContentFingerprint || manifest.projectFingerprint !== rawFingerprint) continue;
    writeJsonAtomically(path, { ...manifest, productionContentFingerprint: contentFingerprint });
  }
}

export function updateProjectLifecycle(
  projectId: string,
  action: ProjectLifecycleAction,
  options: Partial<ProjectStorageContext> = {},
) {
  const context = projectStorageContext(options);
  const current = readProject(context, projectId);
  const beforeProductionFingerprint = productionContentFingerprint(current.project);
  const beforePackageFingerprint = packageContentFingerprint(current.project);
  const rawFingerprint = createHash('sha256').update(current.rawText).digest('hex');
  upgradeCurrentLegacyManifests(context, current.project, rawFingerprint);
  const timestamp = context.now().toISOString();
  const project: ShortVideoProject = {
    ...current.project,
    lifecycle: action.action === 'archive'
      ? {
          state: 'archived',
          archivedAt: timestamp,
          archivedBy: action.archivedBy,
          archiveReason: action.archiveReason,
        }
      : { state: 'active', archivedAt: '', archivedBy: '', archiveReason: '' },
  };
  if (productionContentFingerprint(project) !== beforeProductionFingerprint
    || packageContentFingerprint(project) !== beforePackageFingerprint) {
    throw new ProjectLifecycleError('生命周期操作不得改变生产或打包内容指纹。', 500);
  }
  writeJsonAtomically(current.path, project);
  return project;
}

function isInside(path: string, root: string) {
  return path.startsWith(`${root}${sep}`);
}

function isAtOrInside(path: string, root: string) {
  return path === root || isInside(path, root);
}

function allowedRoots(context: ProjectStorageContext) {
  return [
    context.projectsRoot,
    resolve(context.rootDir, 'public/project-assets'),
    resolve(context.rootDir, 'public/renders'),
    resolve(context.rootDir, 'output/videos'),
    resolve(context.rootDir, 'output/exports'),
    resolve(context.rootDir, 'output/source-processing'),
    resolve(context.rootDir, 'output/source-review'),
    resolve(context.rootDir, 'output/source-previews'),
    resolve(context.rootDir, 'output/scene-information-layers'),
    resolve(context.rootDir, 'output/information-layer'),
    resolve(context.rootDir, 'output/playwright'),
    resolve(context.rootDir, 'output/research'),
  ];
}

function protectedSharedRoots(context: ProjectStorageContext) {
  return [
    context.trashRoot,
    resolve(context.rootDir, 'output/ai-cache'),
    resolve(context.rootDir, 'output/models'),
    resolve(context.rootDir, 'output/render-cache'),
    resolve(context.rootDir, 'output/transcription-cache'),
    resolve(context.rootDir, 'output/voice-cache'),
    resolve(context.rootDir, 'output/source-downloads'),
    resolve(context.rootDir, 'output/render-queue'),
    resolve(context.rootDir, 'output/source-processing-queue'),
    resolve(context.rootDir, 'output/project-planning-queue'),
  ];
}

function inspectTarget(path: string) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return { kind: 'symlink' as const, fileCount: 1, bytes: stat.size };
  if (!stat.isDirectory()) return { kind: 'file' as const, fileCount: 1, bytes: stat.size };
  let fileCount = 0;
  let bytes = 0;
  for (const entry of readdirSync(path)) {
    const inspected = inspectTarget(join(path, entry));
    fileCount += inspected.fileCount;
    bytes += inspected.bytes;
  }
  return { kind: 'directory' as const, fileCount, bytes };
}

function walkJsonFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) return root.endsWith('.json') ? [root] : [];
  return readdirSync(root).flatMap((entry) => walkJsonFiles(join(root, entry)));
}

function findDeletionReference(
  value: unknown,
  projectId: string,
  targets: ProjectDeletionTarget[],
  rootDir: string,
  pointer = '$',
): string | null {
  if (typeof value === 'string') {
    if (value === projectId) return pointer;
    const referencedPath = resolve(rootDir, value);
    if (targets.some((target) => isAtOrInside(referencedPath, target.path))) return pointer;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findDeletionReference(value[index], projectId, targets, rootDir, `${pointer}[${index}]`);
      if (found) return found;
    }
  } else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      const found = findDeletionReference(nested, projectId, targets, rootDir, `${pointer}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

function collectManifestPaths(manifest: ShortVideoRenderManifest | null) {
  if (!manifest) return [];
  const paths = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) paths.add(value);
  };
  Object.values(manifest.artifacts ?? {}).forEach(add);
  manifest.proof?.frames?.forEach(add);
  manifest.acceptance?.semantic?.scenes?.forEach((scene) => scene.frames.forEach(add));
  add(manifest.acceptance?.semantic?.reviewSessionPath);
  add(manifest.acceptance?.semantic?.editorialQuality?.sourcePath);
  add(manifest.acceptance?.browser?.screenshot);
  manifest.acceptance?.browser?.checks?.forEach((check) => add(check.screenshot));
  return [...paths];
}

function projectDeclaredPaths(project: ShortVideoProject) {
  const paths = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) paths.add(value);
  };
  Object.values(project.outputs).forEach(add);
  add(`${project.outputs.exportDir}.zip`);
  add(`${project.outputs.exportDir}.package.json`);
  for (const rendition of resolveProjectRenditions(project)) {
    add(rendition.outputVideo);
    add(rendition.publicRender);
    add(rendition.workDir);
  }
  return [...paths];
}

function projectEvidencePaths(project: ShortVideoProject) {
  const paths = new Set<string>();
  project.materialQualityReview?.sceneReviews.forEach((review) => review.evidence.forEach((path) => {
    if (path.trim()) paths.add(path);
  }));
  return [...paths];
}

export function buildProjectDeletionPlan(
  projectId: string,
  options: Partial<ProjectStorageContext> = {},
): ProjectDeletionPlan {
  const context = projectStorageContext(options);
  const { project, path: canonicalPath } = readProject(context, projectId);
  const blockers: ProjectDeletionBlocker[] = [];
  const candidates = new Map<string, string>();
  const roots = allowedRoots(context);
  const outputRoot = resolve(context.rootDir, 'output');
  const sharedRoots = protectedSharedRoots(context);
  if (context.systemProjectIds.includes(projectId)) {
    blockers.push({
      code: 'referenced',
      message: '该项目是系统兼容 fixture，永久删除已被保护。',
      source: 'src/shortVideoBrief.ts#DEFAULT_PROJECT_ID',
    });
  }
  const addTarget = (category: string, declaredPath: string, allowDeclaredOutputFile = false) => {
    const absolutePath = resolveProjectPath(context, declaredPath);
    const standardAllowed = roots.some((root) => isInside(absolutePath, root));
    const declaredOutputFileAllowed = allowDeclaredOutputFile
      && isInside(absolutePath, outputRoot)
      && !sharedRoots.some((root) => isAtOrInside(absolutePath, root))
      && (!existsSync(absolutePath) || !lstatSync(absolutePath).isDirectory());
    if (!standardAllowed && !declaredOutputFileAllowed) {
      blockers.push({
        code: 'unsafe_path',
        message: `路径不在删除 allowlist 中：${declaredPath}`,
        source: declaredPath,
      });
      return;
    }
    if (existsSync(absolutePath)) candidates.set(absolutePath, category);
  };

  addTarget('规范项目', dirname(canonicalPath));
  addTarget('项目素材', join(context.rootDir, 'public/project-assets', projectId));
  addTarget('来源处理证据', join(context.rootDir, 'output/source-processing', projectId));
  addTarget('来源审查证据', join(context.rootDir, 'output/source-review', projectId));
  addTarget('来源预览', join(context.rootDir, 'output/source-previews', projectId));
  addTarget('信息层证据', join(context.rootDir, 'output/scene-information-layers', projectId));
  addTarget('信息层证据', join(context.rootDir, 'output/information-layer', projectId));
  addTarget('Playwright 证据', join(context.rootDir, 'output/playwright', projectId));
  projectDeclaredPaths(project).forEach((path) => addTarget('项目声明产物', path));
  projectEvidencePaths(project).forEach((path) => addTarget('素材验收证据', path, true));

  for (const manifestPath of manifestPaths(context, project)) {
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ShortVideoRenderManifest;
      collectManifestPaths(manifest).forEach((path) => addTarget('manifest 与验收证据', path, true));
    } catch (error) {
      blockers.push({
        code: 'inspection_failed',
        message: `无法检查 render manifest：${error instanceof Error ? error.message : manifestPath}`,
        source: relative(context.rootDir, manifestPath),
      });
    }
  }

  const sortedCandidates = [...candidates.entries()].sort(([left], [right]) => left.length - right.length);
  const selected = sortedCandidates.filter(([path], index) => (
    !sortedCandidates.slice(0, index).some(([parent]) => isInside(path, parent))
  ));
  const targets = selected.map(([path, category]) => ({
    category,
    path,
    relativePath: relative(context.rootDir, path),
    ...inspectTarget(path),
  }));

  let renderJobs: ReturnType<typeof listRenderQueueJobs> = [];
  let sourceJobs: ReturnType<typeof listSourceProcessingJobs> = [];
  let planningJobs: ReturnType<typeof listProjectPlanningJobs> = [];
  try {
    renderJobs = listRenderQueueJobs(context.renderQueuePath).filter((job) => job.projectId === projectId);
    sourceJobs = listSourceProcessingJobs(context.sourceProcessingQueuePath).filter((job) => job.projectId === projectId);
    planningJobs = listProjectPlanningJobs(context.projectPlanningQueuePath).filter((job) => job.projectId === projectId);
  } catch (error) {
    blockers.push({ code: 'inspection_failed', message: `无法检查共享队列：${error instanceof Error ? error.message : '未知错误'}` });
  }
  const activeJobs = [...renderJobs, ...sourceJobs, ...planningJobs].filter((job) => activeQueueStates.has(job.state));
  if (activeJobs.length > 0) {
    blockers.push({
      code: 'active_queue',
      message: `项目仍有 ${activeJobs.length} 个 queued/running/cancelling 任务，必须先结束任务。`,
    });
  }

  const canonicalDirectory = dirname(canonicalPath);
  const referenceFiles = [
    ...context.referenceRoots.flatMap(walkJsonFiles),
    ...walkJsonFiles(context.projectsRoot).filter((path) => !isAtOrInside(path, canonicalDirectory)),
  ];
  for (const path of [...new Set(referenceFiles)]) {
    try {
      const pointer = findDeletionReference(
        JSON.parse(readFileSync(path, 'utf8')),
        projectId,
        targets,
        context.rootDir,
      );
      if (pointer) {
        blockers.push({
          code: 'referenced',
          message: `项目或其依赖仍被结构化配置引用：${relative(context.rootDir, path)} ${pointer}`,
          source: relative(context.rootDir, path),
        });
      }
    } catch (error) {
      blockers.push({
        code: 'inspection_failed',
        message: `无法核验结构化引用：${relative(context.rootDir, path)}`,
        source: relative(context.rootDir, path),
      });
    }
  }

  const totals = targets.reduce((sum, target) => ({
    files: sum.files + target.fileCount,
    bytes: sum.bytes + target.bytes,
  }), { files: 0, bytes: 0 });
  return {
    schemaVersion: 1,
    projectId,
    generatedAt: context.now().toISOString(),
    canDelete: blockers.length === 0,
    targets,
    totals,
    queueRecords: {
      render: renderJobs.length,
      sourceProcessing: sourceJobs.length,
      projectPlanning: planningJobs.length,
    },
    blockers,
  };
}

export function moveProjectToTrash(
  projectId: string,
  confirmation: string,
  options: Partial<ProjectStorageContext> = {},
): ProjectDeletionReceipt {
  const context = projectStorageContext(options);
  if (confirmation !== projectId) throw new ProjectLifecycleError('请输入完整项目 ID 以确认删除。', 422);
  const plan = buildProjectDeletionPlan(projectId, context);
  if (!plan.canDelete) throw new ProjectLifecycleError(plan.blockers.map((blocker) => blocker.message).join('；'), 409);
  const deletedAt = context.now().toISOString();
  const timestamp = deletedAt.replace(/[:.]/g, '-');
  const trashDirectory = join(context.trashRoot, projectId, timestamp);
  if (existsSync(trashDirectory)) throw new ProjectLifecycleError('删除收据目录已存在，请稍后重试。', 409);
  mkdirSync(trashDirectory, { recursive: true });

  const movedTargets = plan.targets.map((target) => {
    const trashPath = join(trashDirectory, target.relativePath);
    mkdirSync(dirname(trashPath), { recursive: true });
    renameSync(target.path, trashPath);
    return { ...target, trashPath };
  });
  const removedQueueRecords = {
    render: removeRenderQueueJobsForProject(context.renderQueuePath, projectId, { now: context.now }).length,
    sourceProcessing: removeSourceProcessingJobsForProject(context.sourceProcessingQueuePath, projectId, { now: context.now }).length,
    projectPlanning: removeProjectPlanningJobsForProject(context.projectPlanningQueuePath, projectId, { now: context.now }).length,
  };
  const receipt: ProjectDeletionReceipt = {
    schemaVersion: 1,
    projectId,
    deletedAt,
    mode: 'trash',
    trashDirectory,
    movedTargets,
    removedQueueRecords,
    totals: plan.totals,
  };
  writeJsonAtomically(join(trashDirectory, 'deletion-receipt.json'), receipt);
  return receipt;
}
