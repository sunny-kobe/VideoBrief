import assert from 'node:assert/strict';
import test from 'node:test';
import { exactFrameExtractionArgs } from '../scripts/lib/frame-extraction.mjs';

test('exact frame extraction decodes before seeking to avoid keyframe artifacts', () => {
  const args = exactFrameExtractionArgs('/tmp/input.mp4', 18, '/tmp/frame.png');

  assert.ok(args.indexOf('-i') < args.indexOf('-ss'));
  assert.deepEqual(args.slice(args.indexOf('-i'), args.indexOf('-i') + 2), ['-i', '/tmp/input.mp4']);
  assert.deepEqual(args.slice(args.indexOf('-ss'), args.indexOf('-ss') + 2), ['-ss', '18.000']);
});

test('exact frame extraction clamps negative timestamps', () => {
  const args = exactFrameExtractionArgs('input.mp4', -4, 'frame.png');

  assert.equal(args[args.indexOf('-ss') + 1], '0.000');
});
