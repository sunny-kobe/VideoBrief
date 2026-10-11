import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { productionContentFingerprint } from './lib/production-content-fingerprint.mjs';
import { hashMediaFile } from './lib/hash-media-file.mjs';
import { dirname, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  buildReviewWorkPackage,
  renderReviewWorkPackageHtml,
} from './lib/review-work-package.mjs';

function flag(name, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const manifestPath = resolve(flag('manifest', 'output/videos/codex-app-explainer-work/render-manifest.json'));
if (!existsSync(manifestPath)) throw new Error(`Render manifest not found: ${manifestPath}`);
let manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!manifest.proof?.passed) throw new Error('Technical proof must pass before preparing the review package.');

if (!manifest.briefPath) throw new Error('Canonical project file is missing.');
const briefPath = resolve(manifest.briefPath);
if (!existsSync(briefPath)) throw new Error('Canonical project file is missing.');
const projectText = readFileSync(briefPath, 'utf8');
const project = JSON.parse(projectText);
if (project.id !== manifest.projectId) throw new Error('Review manifest belongs to another canonical project.');
const projectMatches = manifest.productionContentFingerprint
  ? productionContentFingerprint(project) === manifest.productionContentFingerprint
  : createHash('sha256').update(projectText).digest('hex') === manifest.projectFingerprint;
if (!projectMatches) throw new Error('Canonical project changed after render; review package cannot use a stale video.');
const videoPath = manifest.artifacts?.publicRender ?? manifest.artifacts?.outputVideo;
if (!videoPath || !existsSync(videoPath) || statSync(videoPath).size === 0) throw new Error('Rendered video is missing.');
if (!manifest.acceptance?.videoSha256 || hashMediaFile(videoPath) !== manifest.acceptance.videoSha256) {
  throw new Error('Rendered video bytes do not match the current acceptance record.');
}

const reviews = new Map((manifest.acceptance?.semantic?.scenes ?? []).map((scene) => [scene.sceneId, scene]));
const enabledScenes = (project.scenes ?? []).filter((scene) => scene.enabled !== false);
const framesComplete = enabledScenes.length > 0 && enabledScenes.every((scene) => {
  const frames = reviews.get(scene.id)?.frames;
  return Array.isArray(frames) && frames.length === 3 && new Set(frames).size === 3
    && frames.every((frame) => existsSync(frame) && statSync(frame).isFile() && statSync(frame).size > 0);
});
if (!framesComplete) {
  const prepare = spawnSync(process.execPath, [
    'scripts/review-video-semantics.mjs',
    `--manifest=${manifestPath}`,
  ], { cwd: process.cwd(), encoding: 'utf8' });
  if (prepare.status !== 0) {
    throw new Error(String(prepare.stderr || prepare.stdout || 'Failed to extract semantic review frames.').trim());
  }
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
}

const reviewPackage = buildReviewWorkPackage(project, manifest);
const workDir = dirname(manifestPath);
const jsonPath = resolve(workDir, 'review-work-package.json');
const htmlPath = resolve(workDir, 'review-work-package.html');
writeFileSync(jsonPath, `${JSON.stringify({ ...reviewPackage, createdAt: new Date().toISOString() }, null, 2)}\n`);
writeFileSync(htmlPath, renderReviewWorkPackageHtml(reviewPackage, (path) => (
  path ? relative(workDir, resolve(path)).split(sep).join('/') : ''
)));

console.log(JSON.stringify({ projectId: project.id, jsonPath, htmlPath, sceneCount: reviewPackage.sceneCount }, null, 2));
