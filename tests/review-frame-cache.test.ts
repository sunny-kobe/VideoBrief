import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractCachedReviewFrame } from '../scripts/lib/review-frame-cache.mjs';

test('unchanged review frames avoid decoding; changed video, time, or damaged bytes require it', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-frame-'));
  const output = join(root, 'frame.png');
  let calls = 0;
  const extract = () => { calls++; writeFileSync(output, `frame-${calls}`); return { status: 0 }; };
  const run = (videoSha256 = 'video-1', args = ['-ss', '1']) => extractCachedReviewFrame({ output, videoSha256, args, extract });
  try {
    assert.equal(run().cacheHit, false);
    assert.equal(run().cacheHit, true);
    assert.equal(calls, 1);
    assert.equal(run('video-2').cacheHit, false);
    assert.equal(run('video-2', ['-ss', '2']).cacheHit, false);
    writeFileSync(output, 'damaged');
    assert.equal(run('video-2', ['-ss', '2']).cacheHit, false);
    writeFileSync(output, '');
    assert.equal(run('video-2', ['-ss', '2']).cacheHit, false);
    assert.equal(calls, 5);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('failed extraction cannot turn an old output into a valid new frame', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-frame-'));
  const output = join(root, 'frame.png');
  try {
    writeFileSync(output, 'old-frame');
    const result = extractCachedReviewFrame({ output, videoSha256: 'new-video', args: [], extract: () => ({ status: 1 }) });
    assert.equal(result.success, false);
    assert.equal(result.cacheHit, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
