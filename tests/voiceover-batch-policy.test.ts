import assert from 'node:assert/strict';
import test from 'node:test';

import {
  errorCode,
  providerHttpStatus,
  shouldFallbackBatchVoiceover,
} from '../scripts/lib/voiceover-batch-policy.mjs';
import { SceneTimingError } from '../scripts/lib/scene-timing.mjs';

test('does not amplify a provider quota failure into per-scene requests', () => {
  const providerError = Object.assign(new Error('quota exceeded'), { status: 429 });
  const batchError = new Error('batch voice generation failed', { cause: providerError });

  assert.equal(providerHttpStatus(batchError), 429);
  assert.equal(shouldFallbackBatchVoiceover(batchError), false);
});

test('keeps per-scene fallback for local batch segmentation failures', () => {
  assert.equal(providerHttpStatus(new Error('surplus pauses')), null);
  assert.equal(shouldFallbackBatchVoiceover(new Error('surplus pauses')), true);
});

test('does not amplify a permanent provider location failure into per-scene requests', () => {
  const providerError = Object.assign(new Error('User location is not supported for the API use.'), {
    status: 400, permanent: true,
  });
  const batchError = new Error('batch voice generation failed', { cause: providerError });
  assert.equal(shouldFallbackBatchVoiceover(batchError), false);
});

test('does not retry per scene when a batch segment exposes an invalid scene timeline', () => {
  const timingError = new SceneTimingError(
    'Scene scene-01 frame-aligned video window is shorter than its narration.',
  );
  const batchError = new Error('batch voice segmentation failed', { cause: timingError });

  assert.equal(errorCode(batchError), 'SCENE_TIMING_INVALID');
  assert.equal(shouldFallbackBatchVoiceover(batchError), false);
});
