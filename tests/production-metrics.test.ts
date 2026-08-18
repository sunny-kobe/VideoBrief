import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProductionMetrics } from '../scripts/lib/production-metrics.mjs';

test('counts uncached AI and voiceover requests without inventing monetary cost', () => {
  const metrics = buildProductionMetrics({
    finalizedAt: '2026-07-22T00:10:00.000Z',
    project: {
      production: { trackingStartedAt: '2026-07-22T00:00:00.000Z', renderFailureCount: 1 },
      sources: [{ processing: { status: 'failed' } }],
      ai: {
        calls: [
          { status: 'completed', cacheHit: false, startedAt: '2026-07-22T00:00:00.000Z', completedAt: '2026-07-22T00:00:02.000Z' },
          { status: 'completed', cacheHit: true, startedAt: '2026-07-22T00:00:02.000Z', completedAt: '2026-07-22T00:00:02.010Z' },
          { status: 'failed', cacheHit: false, startedAt: '2026-07-22T00:00:03.000Z', completedAt: '2026-07-22T00:00:08.000Z' },
          { status: 'failed', model: 'whisper.cpp:large-v3-turbo-q5_0', cacheHit: false, startedAt: '2026-07-22T00:00:08.000Z', completedAt: '2026-07-22T00:00:12.000Z' },
        ],
      },
    },
    manifest: {
      renderedAt: '2026-07-22T00:05:00.000Z',
      proof: { checkedAt: '2026-07-22T00:06:00.000Z' },
      acceptance: {
        semantic: {
          checkedAt: '2026-07-22T00:07:00.000Z',
          activeSeconds: 90,
          activeSecondsSource: 'review-session',
        },
        browser: { status: 'passed', checkedAt: '2026-07-22T00:08:00.000Z' },
      },
      voiceover: { batch: { cacheHit: false } },
      productionMetrics: {
        renderCache: {
          strategy: 'segmented-concat',
          sceneSegments: 6,
          sceneSegmentCacheHits: 5,
          sceneSegmentCacheMisses: 1,
          finalVideoReencoded: false,
          finalAudioReencoded: true,
        },
      },
    },
  });
  assert.equal(metrics.requests.aiExternal, 2);
  assert.equal(metrics.requests.aiLocalRecorded, 1);
  assert.equal(metrics.requests.aiCacheHits, 1);
  assert.equal(metrics.requests.voiceoverExternal, 1);
  assert.equal(metrics.requests.totalExternal, 3);
  assert.equal(metrics.operatorActive.manualReviewSeconds, 90);
  assert.equal(metrics.operatorActive.measurement, 'system_measured');
  assert.equal(metrics.failureCost.failedAiWallMs, 5000);
  assert.equal(metrics.failureCost.failedAiExternalRequests, 1);
  assert.equal(metrics.failureCost.failedLocalCalls, 1);
  assert.equal(metrics.failureCost.failedLocalWallMs, 4000);
  assert.equal(metrics.failureCost.monetaryCostUsd, null);
  assert.equal(metrics.elapsed.renderToFinalAcceptanceMs, 180000);
  assert.equal(metrics.renderCache.sceneSegmentCacheHits, 5);
});

test('marks manual active time as missing instead of assuming zero', () => {
  const metrics = buildProductionMetrics({
    finalizedAt: '2026-07-22T00:10:00.000Z',
    project: { production: {}, sources: [], ai: { calls: [] } },
    manifest: { voiceover: { segments: [] } },
  });
  assert.equal(metrics.operatorActive.manualReviewSeconds, null);
  assert.equal(metrics.operatorActive.measurement, 'not_recorded');
});
