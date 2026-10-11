import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashMediaFile } from '../scripts/lib/hash-media-file.mjs';

test('hashes empty, exact chunk and partial final chunk bytes identically to SHA-256', () => {
  const dir = mkdtempSync(join(tmpdir(), 'videobrief-hash-'));
  try {
    const path = join(dir, 'media.bin');
    for (const size of [0, 1, 1024 * 1024, 2 * 1024 * 1024 + 137]) {
      const bytes = Buffer.alloc(size);
      for (let i = 0; i < size; i++) bytes[i] = i % 251;
      writeFileSync(path, bytes);
      assert.equal(hashMediaFile(path), createHash('sha256').update(bytes).digest('hex'));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('same-size replacement with preserved timestamp is rehashed and missing files fail', () => {
  const dir = mkdtempSync(join(tmpdir(), 'videobrief-hash-'));
  try {
    const path = join(dir, 'media.bin');
    writeFileSync(path, 'aaaa');
    utimesSync(path, 100, 100);
    const first = hashMediaFile(path);
    writeFileSync(path, 'bbbb');
    utimesSync(path, 100, 100);
    assert.notEqual(hashMediaFile(path), first);
    assert.throws(() => hashMediaFile(join(dir, 'missing')), /ENOENT/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
