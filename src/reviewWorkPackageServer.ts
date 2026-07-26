import { basename, dirname, resolve, sep } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import {
  renderReviewWorkPackageHtml,
  type ReviewWorkPackage,
} from '../scripts/lib/review-work-package.mjs';
import {
  assertProjectId,
  projectPaths,
  readBrief,
  readRenderManifest,
  renderStatus,
} from './shortVideoProjectServer';

function readJson(path: string) {
  if (!existsSync(path)) throw new Error('当前版本尚未生成审片工作包。');
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<ReviewWorkPackage>;
  if (
    value.schemaVersion !== 1
    || typeof value.projectId !== 'string'
    || typeof value.videoPath !== 'string'
    || typeof value.videoSha256 !== 'string'
    || !Array.isArray(value.scenes)
  ) throw new Error('审片工作包格式无效，请重新生成。');
  return value as ReviewWorkPackage;
}

export function readCurrentReviewWorkPackage(projectId: string) {
  const project = readBrief(assertProjectId(projectId));
  const paths = projectPaths(project);
  const manifest = readRenderManifest(paths.manifestPath);
  const status = renderStatus(manifest, project.id);
  if (status.state !== 'ready' || !manifest?.acceptance?.videoSha256) {
    throw new Error('当前成片尚未完成技术、语义和浏览器验收。');
  }
  const workDir = dirname(paths.manifestPath);
  const reviewPackage = readJson(resolve(workDir, 'review-work-package.json'));
  const manifestVideoPath = manifest.artifacts.publicRender ?? manifest.artifacts.outputVideo;
  if (
    reviewPackage.projectId !== project.id
    || reviewPackage.videoSha256 !== manifest.acceptance.videoSha256
    || resolve(reviewPackage.videoPath) !== resolve(manifestVideoPath)
  ) {
    throw new Error('审片工作包未绑定当前成片，请重新生成。');
  }
  return { project, paths, manifest, workDir, reviewPackage };
}

export function resolveReviewFramePath(
  workDir: string,
  reviewPackage: { scenes: Array<{ frames: string[] }> },
  fileName: string,
) {
  if (!/^scene-[a-z0-9-]+-(?:start|mid|end)\.png$/.test(fileName)) {
    throw new Error('审片帧名称无效。');
  }
  const allowed = new Set(
    reviewPackage.scenes.flatMap((scene) => scene.frames ?? []).map((frame) => basename(frame)),
  );
  if (!allowed.has(fileName)) throw new Error('该文件不属于当前审片工作包。');
  const frameRoot = resolve(workDir, 'semantic-proof');
  const framePath = resolve(frameRoot, fileName);
  if (!framePath.startsWith(`${frameRoot}${sep}`) || !existsSync(framePath)) {
    throw new Error('审片帧不存在。');
  }
  return framePath;
}

export function renderCurrentReviewWorkPackage(projectId: string) {
  const current = readCurrentReviewWorkPackage(projectId);
  const frameNames = new Set(
    current.reviewPackage.scenes
      .flatMap((scene) => scene.frames ?? [])
      .map((frame) => basename(frame)),
  );
  return renderReviewWorkPackageHtml(current.reviewPackage, (path) => {
    if (resolve(path) === resolve(current.reviewPackage.videoPath)) return current.paths.publicRenderHref;
    const fileName = basename(path);
    return frameNames.has(fileName)
      ? `/api/projects/${encodeURIComponent(projectId)}/review-package/frame/${encodeURIComponent(fileName)}`
      : '';
  });
}
