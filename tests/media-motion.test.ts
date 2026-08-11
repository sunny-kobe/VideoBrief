import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMediaMotion } from '../scripts/lib/media-motion.mjs';

test('defaults to no editorial camera motion', () => {
  assert.deepEqual(resolveMediaMotion({ scene: {}, width: 1080, height: 1920, fps: 30, frameCount: 150 }), {
    mode: 'none',
    amount: 0,
    filter: '',
  });
});

test('builds an auditable push-in around the scene focal point', () => {
  const motion = resolveMediaMotion({
    scene: { mediaMotion: 'push-in', mediaMotionAmount: 0.08, mediaFocalX: 0.3, mediaFocalY: 0.35 },
    width: 1080,
    height: 1920,
    fps: 30,
    frameCount: 150,
  });
  assert.equal(motion.mode, 'push-in');
  assert.equal(motion.amount, 0.08);
  assert.match(motion.filter, /min\(1\+on\*0\.08\/149,1\.08\)/);
  assert.match(motion.filter, /\(iw-iw\/zoom\)\*0\.3/);
  assert.match(motion.filter, /s=1080x1920:fps=30/);
});

test('clamps an excessive pull-out amount', () => {
  const motion = resolveMediaMotion({
    scene: { mediaMotion: 'pull-out', mediaMotionAmount: 0.5 },
    width: 1920,
    height: 1080,
    fps: 30,
    frameCount: 90,
  });
  assert.equal(motion.mode, 'pull-out');
  assert.equal(motion.amount, 0.12);
  assert.match(motion.filter, /max\(1\.12-on\*0\.12\/89,1\)/);
});
