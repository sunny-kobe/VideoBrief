import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  projectPaths,
  readBrief,
  recordRenderAttempt,
  recordRenderFailure,
} from '../src/shortVideoProjectServer';

const [action, briefArgument] = process.argv.slice(2);
const briefPath = resolve(briefArgument ?? '');

if (!['start', 'fail'].includes(action) || !briefArgument) {
  throw new Error('Usage: record-render-lifecycle.ts <start|fail> <brief-path>');
}

const input = JSON.parse(readFileSync(briefPath, 'utf8')) as { id?: string };
if (!input.id) throw new Error(`Canonical project has no id: ${briefPath}`);

const canonical = readBrief(input.id);
if (resolve(projectPaths(canonical).briefPath) !== briefPath) {
  throw new Error(`Render lifecycle path is not canonical for project ${input.id}: ${briefPath}`);
}

if (action === 'start') {
  recordRenderAttempt(input.id);
} else {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const message = Buffer.concat(chunks).toString('utf8').trim() || 'render failed';
  recordRenderFailure(input.id, message);
}
