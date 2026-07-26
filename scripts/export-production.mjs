import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  validateBrowserChecks,
  validateSemanticAcceptanceRecord,
} from './lib/acceptance-validation.mjs';
import { productionContentFingerprint } from './lib/production-content-fingerprint.mjs';
import { assertPreproductionGates } from './lib/production-workflow-contract.mjs';

const briefArg = process.argv.slice(2).find((arg) => arg.startsWith('--brief='));
const stageArg = process.argv.slice(2).find((arg) => arg.startsWith('--stage='));
const requestedStage = stageArg?.slice('--stage='.length) ?? 'auto';
const briefPath = resolve(briefArg?.slice('--brief='.length) ?? 'content/projects/codex-app-explainer/project.json');
const projectText = readFileSync(briefPath, 'utf8');
const project = JSON.parse(projectText);
assertPreproductionGates(project);
const manifestPath = resolve(project.outputs?.workDir ?? dirname(briefPath), 'render-manifest.json');

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit', cwd: process.cwd() });
  if (result.status !== 0) {
    throw new Error(`${script} exited with ${result.status ?? 1}.`);
  }
}

function recordRenderLifecycle(action, message = '') {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/record-render-lifecycle.ts', action, briefPath],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      input: message,
    },
  );
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || `Could not record render lifecycle ${action}.`).trim());
  }
}

function currentAcceptancePassed() {
  if (!existsSync(manifestPath)) return false;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const fingerprint = createHash('sha256').update(projectText).digest('hex');
  const contentFingerprint = productionContentFingerprint(project);
  const projectMatches = manifest.productionContentFingerprint
    ? manifest.productionContentFingerprint === contentFingerprint
    : manifest.projectFingerprint === fingerprint;
  return projectMatches
    && manifest.proof?.passed === true
    && validateSemanticAcceptanceRecord(manifest.acceptance?.semantic).passed
    && manifest.acceptance?.browser?.status === 'passed'
    && validateBrowserChecks(
      manifest.acceptance?.browser?.checks ?? [],
      Number(manifest.render?.duration),
    ).passed;
}

if (requestedStage === 'package') {
  console.log('[videobrief-stage] packaging');
  run('scripts/build-export-package.mjs', [`--brief=${briefPath}`]);
  process.exit(0);
}

if (requestedStage === 'auto' && currentAcceptancePassed()) {
  console.log('[videobrief-stage] packaging');
  run('scripts/build-export-package.mjs', [`--brief=${briefPath}`]);
  process.exit(0);
}

console.log('[videobrief-stage] rendering');
recordRenderLifecycle('start');
try {
  run('scripts/render-local-short-video-synced.mjs', [`--brief=${briefPath}`]);
  console.log('[videobrief-stage] proof');
  run('scripts/proof-video.mjs', [`--manifest=${manifestPath}`]);
  console.log('[videobrief-stage] awaiting-review');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  try {
    recordRenderLifecycle('fail', message);
  } catch (recordError) {
    console.error(recordError instanceof Error ? recordError.message : recordError);
  }
  throw error;
}
