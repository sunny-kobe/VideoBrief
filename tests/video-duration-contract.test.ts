import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertProjectTargetDuration,
  validateProjectTargetDuration,
  validateRenderedDuration,
} from '../scripts/lib/video-duration-contract.mjs';

test('accepts project targets through fifteen minutes', () => {
  assert.equal(validateProjectTargetDuration(900).passed, true);
  assert.equal(assertProjectTargetDuration(480), 480);
});

test('rejects project targets beyond the supported production contract', () => {
  assert.equal(validateProjectTargetDuration(901).passed, false);
  assert.throws(() => assertProjectTargetDuration(901), /must not exceed 900 seconds/);
});

test('does not apply long-form tolerance to existing short videos', () => {
  const validation = validateRenderedDuration(48, 54.4);
  assert.equal(validation.passed, true);
  assert.equal(validation.applies, false);
});

test('accepts a long-form output inside the target tolerance', () => {
  const validation = validateRenderedDuration(600, 540);
  assert.equal(validation.passed, true);
  assert.equal(validation.applies, true);
  assert.equal(validation.minimumDurationSeconds, 510);
  assert.equal(validation.maximumDurationSeconds, 690);
});

test('rejects an undersized or oversized long-form output', () => {
  assert.equal(validateRenderedDuration(600, 509).passed, false);
  assert.equal(validateRenderedDuration(600, 691).passed, false);
});
