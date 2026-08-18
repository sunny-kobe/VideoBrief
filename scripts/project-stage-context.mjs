import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildProjectStageContext } from './lib/project-stage-context.mjs';

function flag(name, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const briefPath = resolve(flag('brief', ''));
const stage = flag('stage', 'research');
if (!flag('brief')) throw new Error('Usage: --brief=content/projects/<project-id>/project.json --stage=research|material|delivery');
if (!existsSync(briefPath)) throw new Error(`Canonical project not found: ${briefPath}`);
const project = JSON.parse(readFileSync(briefPath, 'utf8'));
const manifestFlag = flag('manifest');
const inferredManifest = project?.outputs?.workDir
  ? resolve(project.outputs.workDir, 'render-manifest.json')
  : '';
const manifestPath = manifestFlag ? resolve(manifestFlag) : inferredManifest;
const manifest = manifestPath && existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : null;

process.stdout.write(`${JSON.stringify(buildProjectStageContext(project, stage, manifest), null, 2)}\n`);
