import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

const existingFrames = manifest.acceptance?.semantic?.scenes?.flatMap((scene) => scene.frames ?? []) ?? [];
if (!existingFrames.length || existingFrames.some((frame) => !existsSync(frame))) {
  const prepare = spawnSync(process.execPath, [
    'scripts/review-video-semantics.mjs',
    `--manifest=${manifestPath}`,
  ], { cwd: process.cwd(), encoding: 'utf8' });
  if (prepare.status !== 0) {
    throw new Error(String(prepare.stderr || prepare.stdout || 'Failed to extract semantic review frames.').trim());
  }
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
}

const briefPath = resolve(manifest.briefPath ?? '');
if (!briefPath || !existsSync(briefPath)) throw new Error('Canonical project file is missing.');
const project = JSON.parse(readFileSync(briefPath, 'utf8'));
if (project.id !== manifest.projectId) throw new Error('Review manifest belongs to another canonical project.');

const reviewPackage = buildReviewWorkPackage(project, manifest);
const workDir = dirname(manifestPath);
const jsonPath = resolve(workDir, 'review-work-package.json');
const htmlPath = resolve(workDir, 'review-work-package.html');
writeFileSync(jsonPath, `${JSON.stringify({ ...reviewPackage, createdAt: new Date().toISOString() }, null, 2)}\n`);
writeFileSync(htmlPath, renderReviewWorkPackageHtml(reviewPackage, (path) => (
  path ? relative(workDir, resolve(path)).split(sep).join('/') : ''
)));

console.log(JSON.stringify({ projectId: project.id, jsonPath, htmlPath, sceneCount: reviewPackage.sceneCount }, null, 2));
