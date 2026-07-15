import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const briefArg = process.argv.slice(2).find((arg) => arg.startsWith('--brief='));
const briefPath = resolve(briefArg?.slice('--brief='.length) ?? 'content/projects/codex-app-explainer/project.json');
const project = JSON.parse(readFileSync(briefPath, 'utf8'));
const manifestPath = resolve(project.outputs?.workDir ?? dirname(briefPath), 'render-manifest.json');

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit', cwd: process.cwd() });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('[videobrief-stage] rendering');
run('scripts/render-local-short-video-synced.mjs', [`--brief=${briefPath}`]);
console.log('[videobrief-stage] proof');
run('scripts/proof-video.mjs', [`--manifest=${manifestPath}`]);
console.log('[videobrief-stage] packaging');
run('scripts/build-export-package.mjs', [`--brief=${briefPath}`]);
