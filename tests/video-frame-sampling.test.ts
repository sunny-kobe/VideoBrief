import assert from 'node:assert/strict';
import test from 'node:test';

import {
  planRepresentativeFrameSamples,
  targetRepresentativeFrameCount,
} from '../src/videoFrameSampling';

test('increases representative frame count with duration and caps model input', () => {
  assert.equal(targetRepresentativeFrameCount(10), 4);
  assert.equal(targetRepresentativeFrameCount(60), 5);
  assert.equal(targetRepresentativeFrameCount(180), 9);
  assert.equal(targetRepresentativeFrameCount(1800), 12);
});

test('keeps beginning, middle and ending coverage while adding scene changes', () => {
  const samples = planRepresentativeFrameSamples(120, [8, 22, 23, 68, 97]);
  assert.equal(samples.length, 7);
  assert.ok(samples.some((sample) => Math.abs(sample.ratio - 0.05) < 0.001));
  assert.ok(samples.some((sample) => Math.abs(sample.ratio - 0.5) < 0.001));
  assert.ok(samples.some((sample) => Math.abs(sample.ratio - 0.95) < 0.001));
  assert.ok(samples.some((sample) => sample.reason === 'scene-change'));
  assert.ok(samples.every((sample, index) => index === 0 || sample.second > samples[index - 1].second));
});

test('falls back to duration coverage when scene detection has no results', () => {
  const samples = planRepresentativeFrameSamples(90, []);
  assert.equal(samples.length, 6);
  assert.ok(samples.every((sample) => sample.reason === 'coverage'));
});

test('handles invalid or tiny media durations safely', () => {
  assert.deepEqual(planRepresentativeFrameSamples(0), [{ second: 0, ratio: 0, reason: 'coverage' }]);
  assert.equal(planRepresentativeFrameSamples(0.1).length, 1);
});
