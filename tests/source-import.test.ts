import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  validateSourceImportCapacity,
  writeSourceStreamAtomically,
} from '../src/sourceImportServer';

async function* chunks(values: string[]) {
  for (const value of values) yield Buffer.from(value);
}

test('streams an imported source to an atomic file while hashing incrementally', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'videobrief-source-import-'));
  const destinationPath = join(directory, 'large-source.mp4');
  const values = ['first-', 'second-', 'third'];
  const expected = values.join('');
  const result = await writeSourceStreamAtomically({
    chunks: chunks(values),
    destinationPath,
    expectedBytes: Buffer.byteLength(expected),
    maxBytes: 1024,
  });

  assert.equal(readFileSync(destinationPath, 'utf8'), expected);
  assert.equal(result.bytes, Buffer.byteLength(expected));
  assert.equal(result.contentHash, createHash('sha256').update(expected).digest('hex'));
  assert.deepEqual(readdirSync(directory), ['large-source.mp4']);
});

test('rejects an incomplete stream and leaves no partial or final file', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'videobrief-source-import-'));
  const destinationPath = join(directory, 'incomplete.mp4');

  await assert.rejects(
    writeSourceStreamAtomically({
      chunks: chunks(['short']),
      destinationPath,
      expectedBytes: 10,
      maxBytes: 1024,
    }),
    /上传不完整/,
  );
  assert.equal(existsSync(destinationPath), false);
  assert.deepEqual(readdirSync(directory), []);
});

test('rejects a stream that exceeds its declared size and removes the partial file', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'videobrief-source-import-'));
  const destinationPath = join(directory, 'oversized.mp4');

  await assert.rejects(
    writeSourceStreamAtomically({
      chunks: chunks(['12345', '67890']),
      destinationPath,
      expectedBytes: 8,
      maxBytes: 1024,
    }),
    /超过声明大小/,
  );
  assert.equal(existsSync(destinationPath), false);
  assert.deepEqual(readdirSync(directory), []);
});

test('requires configured disk reserve after the import completes', () => {
  assert.doesNotThrow(() => validateSourceImportCapacity({
    declaredBytes: 2_000,
    freeBytes: 10_000,
    maxBytes: 20_000,
    reserveBytes: 8_000,
  }));
  assert.throws(() => validateSourceImportCapacity({
    declaredBytes: 2_001,
    freeBytes: 10_000,
    maxBytes: 20_000,
    reserveBytes: 8_000,
  }), /磁盘空间不足/);
});
