import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SEGMENT_RENDERER_VERSION,
  segmentCacheIsReusable,
  segmentRenderCacheKey,
} from '../scripts/lib/segment-render-cache.mjs';

function descriptor() {
  return {
    source: { sha256: 'a'.repeat(64), type: 'video', start: 3, end: 8, playbackRate: 1 },
    audioSha256: 'b'.repeat(64),
    render: { width: 1080, height: 1920, fps: 30, fit: 'contain', background: 'solid', motion: 'none', motionAmount: 0 },
    presentation: { title: 'Evidence', subtitle: 'Same claim', overlay: true },
    frameCount: 150,
    filterComplexSha256: 'c'.repeat(64),
    subtitleSha256: 'd'.repeat(64),
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
    filterComplexSha256: original.filterComplexSha256,
    subtitleSha256: original.subtitleSha256,
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
    { ...original, source: { ...original.source, playbackRate: 1.2 } },
    { ...original, render: { ...original.render, motion: 'push-in', motionAmount: 0.08 } },
    { ...original, render: { ...original.render, background: 'blurred-fill' } },
    { ...original, presentation: { ...original.presentation, subtitle: 'Changed claim' } },
    { ...original, filterComplexSha256: 'e'.repeat(64) },
    { ...original, subtitleSha256: 'f'.repeat(64) },
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
