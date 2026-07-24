import assert from 'node:assert/strict';
import test from 'node:test';

import {
  providerHttpStatus,
  shouldFallbackBatchVoiceover,
} from '../scripts/lib/voiceover-batch-policy.mjs';

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
