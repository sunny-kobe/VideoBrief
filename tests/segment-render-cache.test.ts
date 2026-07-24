import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SEGMENT_RENDERER_VERSION,
  segmentCacheIsReusable,
  segmentRenderCacheKey,
} from '../scripts/lib/segment-render-cache.mjs';

function descriptor() {
  return {
    source: { sha256: 'a'.repeat(64), type: 'video', start: 3, end: 8 },
    audioSha256: 'b'.repeat(64),
    render: { width: 1080, height: 1920, fps: 30, fit: 'contain' },
    presentation: { title: 'Evidence', subtitle: 'Same claim', overlay: true },
    frameCount: 150,
  };
}

test('segment cache key is stable across object key order', () => {
  const original = descriptor();
  const reordered = {
    frameCount: original.frameCount,
    presentation: original.presentation,
    render: original.render,
    audioSha256: original.audioSha256,
    source: original.source,
  };
  assert.equal(segmentRenderCacheKey(original), segmentRenderCacheKey(reordered));
});

test('segment cache key changes when source, audio, timing, or presentation changes', () => {
  const original = descriptor();
  const key = segmentRenderCacheKey(original);
  const mutations = [
    { ...original, audioSha256: 'c'.repeat(64) },
    { ...original, frameCount: 151 },
    { ...original, source: { ...original.source, start: 3.1 } },
    { ...original, presentation: { ...original.presentation, subtitle: 'Changed claim' } },
  ];
  for (const mutation of mutations) assert.notEqual(segmentRenderCacheKey(mutation), key);
});

test('segment cache reuse requires matching metadata and rendered bytes', () => {
  const cacheKey = segmentRenderCacheKey(descriptor());
  const segmentSha256 = 'd'.repeat(64);
  const metadata = {
    schemaVersion: 1,
    rendererVersion: SEGMENT_RENDERER_VERSION,
    cacheKey,
    segmentSha256,
  };
  assert.equal(segmentCacheIsReusable(metadata, cacheKey, segmentSha256), true);
  assert.equal(segmentCacheIsReusable(metadata, cacheKey, 'e'.repeat(64)), false);
  assert.equal(segmentCacheIsReusable({ ...metadata, rendererVersion: 'old' }, cacheKey, segmentSha256), false);
});
