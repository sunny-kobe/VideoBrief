import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildPipelineCodeSnapshot,
  summarizePipelineCodeSnapshot,
  validateCurrentPipelineCode,
  validatePipelineCodeSnapshot,
} from '../scripts/lib/pipeline-code-fingerprint.mjs';

test('pipeline code snapshots bind exact file bytes and detect later drift', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-pipeline-code-'));
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(join(root, 'scripts/a.mjs'), 'export const a = 1;\n');
    writeFileSync(join(root, 'scripts/b.mjs'), 'export const b = 2;\n');
    const options = { root, files: ['scripts/a.mjs', 'scripts/b.mjs'] };
    const snapshot = buildPipelineCodeSnapshot(options);
    assert.deepEqual(validatePipelineCodeSnapshot(snapshot), []);
    const summary = summarizePipelineCodeSnapshot(snapshot, 'snapshot-sha');
    assert.equal(summary.snapshotSha256, 'snapshot-sha');
    assert.ok(summary.files.every((file) => !('content' in file)));
    assert.deepEqual(validateCurrentPipelineCode(summary, options), []);

    writeFileSync(join(root, 'scripts/b.mjs'), 'export const b = 3;\n');
    assert.match(validateCurrentPipelineCode(summary, options).join(' '), /changed after render/);
    snapshot.files[0].content = 'tampered';
    assert.match(validatePipelineCodeSnapshot(snapshot).join(' '), /file hash/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
