import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMediaFraming } from '../scripts/lib/media-framing.mjs';

test('contain keeps the full source inside a vertical canvas', () => {
  const framing = resolveMediaFraming({ scene: {}, projectFit: 'contain', width: 1080, height: 1920 });
  assert.equal(framing.fit, 'contain');
  assert.equal(framing.background, 'solid');
  assert.match(framing.filter, /force_original_aspect_ratio=decrease/);
  assert.match(framing.filter, /pad=1080:1920/);
});

test('blurred fill creates an auditable dynamic background behind contained portrait media', () => {
  const framing = resolveMediaFraming({
    scene: {},
    projectFit: 'contain',
    projectBackground: 'blurred-fill',
    width: 1080,
    height: 1920,
  });
  assert.equal(framing.fit, 'contain');
  assert.equal(framing.background, 'blurred-fill');
  assert.equal(framing.filter, '');
  assert.match(framing.backgroundFilter ?? '', /boxblur=/);
  assert.match(framing.backgroundFilter ?? '', /eq=contrast=0\.72:brightness=-0\.015:saturation=0\.45/);
  assert.match(framing.foregroundFilter ?? '', /force_original_aspect_ratio=decrease/);
  assert.match(framing.overlayFilter ?? '', /overlay=/);
});

test('blurred fill falls back to solid for landscape cover output', () => {
  const framing = resolveMediaFraming({
    scene: {},
    projectFit: 'cover',
    projectBackground: 'blurred-fill',
    width: 1920,
    height: 1080,
  });
  assert.equal(framing.background, 'solid');
  assert.match(framing.filter, /crop=1920:1080/);
});

test('a scene can override cover framing with an auditable focal point', () => {
  const framing = resolveMediaFraming({
    scene: { mediaFit: 'cover', mediaFocalX: 0.29, mediaFocalY: 0.7 },
    projectFit: 'contain',
    width: 1080,
    height: 1920,
  });
  assert.equal(framing.fit, 'cover');
  assert.equal(framing.focalX, 0.29);
  assert.equal(framing.focalY, 0.7);
  assert.match(framing.filter, /crop=1080:1920:\(iw-ow\)\*0\.29:\(ih-oh\)\*0\.7/);
});

test('focal points are clamped to the source bounds', () => {
  const framing = resolveMediaFraming({
    scene: { mediaFit: 'cover', mediaFocalX: -2, mediaFocalY: 3 },
    projectFit: 'contain',
    width: 1080,
    height: 1920,
  });
  assert.equal(framing.focalX, 0);
  assert.equal(framing.focalY, 1);
});
