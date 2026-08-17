import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inspectNarrationTailGaps,
  MAX_NARRATION_TAIL_SECONDS,
} from '../scripts/lib/narration-tail-validation.mjs';

test('rejects the multi-second narration tails from the electronic shelf label review regression', () => {
  const result = inspectNarrationTailGaps([
    { id: 'scene-02', duration: 16, speechDuration: 10.799233 },
    { id: 'scene-03', duration: 16, speechDuration: 8.849373 },
    { id: 'scene-04', duration: 16, speechDuration: 8.684627 },
  ]);

  assert.equal(MAX_NARRATION_TAIL_SECONDS, 1.25);
  assert.deepEqual(result.excessive.map((check) => check.sceneId), [
    'scene-02',
    'scene-03',
    'scene-04',
  ]);
  assert.ok(result.excessive.every((check) => check.tailSeconds > 5));
});

test('accepts short scene-ending breath while deriving duration from timeline boundaries', () => {
  const result = inspectNarrationTailGaps([
    { id: 'scene-01', start: 0, end: 17.2, speechDuration: 16.695375 },
    { id: 'scene-02', start: 17.2, end: 28.5, speechDuration: 10.799233 },
  ]);

  assert.equal(result.excessive.length, 0);
  assert.ok(result.checks.every((check) => check.passed));
  assert.ok(result.checks.every((check) => check.tailSeconds < 0.51));
});

test('ignores legacy timeline scenes without measured speech duration', () => {
  assert.deepEqual(inspectNarrationTailGaps([
    { id: 'legacy', start: 0, end: 10 },
  ]).checks, []);
});
