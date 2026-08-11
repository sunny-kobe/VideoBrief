import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSceneTiming } from '../scripts/lib/scene-timing.mjs';
import { validateVideoWindow } from '../scripts/lib/media-window-validation.mjs';

test('preserves an explicitly selected video window', () => {
  assert.deepEqual(resolveSceneTiming({
    sceneId: 'evidence',
    sourceType: 'video',
    sourceStart: 12,
    sourceEnd: 20,
    voiceDuration: 7.5,
  }), {
    sourceStart: 12,
    sourceEnd: 20,
    renderSourceEnd: 20,
    duration: 8,
    frameCount: 240,
    selectedDuration: 8,
    mediaPlaybackRate: 1,
  });
});

test('maps a selected source window to a faster frame-aligned output without changing the window', () => {
  assert.deepEqual(resolveSceneTiming({
    sceneId: 'dense-demo',
    sourceType: 'video',
    sourceStart: 12,
    sourceEnd: 18,
    mediaPlaybackRate: 1.2,
    voiceDuration: 4.8,
    fps: 30,
  }), {
    sourceStart: 12,
    sourceEnd: 18,
    renderSourceEnd: 18,
    duration: 5,
    frameCount: 150,
    selectedDuration: 6,
    mediaPlaybackRate: 1.2,
  });
});

test('rejects a media playback rate outside the auditable production range', () => {
  assert.throws(() => resolveSceneTiming({
    sceneId: 'too-fast',
    sourceType: 'video',
    sourceStart: 0,
    sourceEnd: 6,
    mediaPlaybackRate: 5,
    voiceDuration: 1,
  }), /mediaPlaybackRate between 0.25 and 4/);
});

test('rejects a video window that cannot cover the narration', () => {
  assert.throws(() => resolveSceneTiming({
    sceneId: 'install',
    sourceType: 'video',
    sourceStart: 6.59,
    sourceEnd: 7.59,
    voiceDuration: 8.42,
  }), /Select a longer semantic clip instead of looping it/);
});

test('aligns video duration to whole output frames without exceeding the selected window', () => {
  const timing = resolveSceneTiming({
    sceneId: 'document-twin',
    sourceType: 'video',
    sourceStart: 31,
    sourceEnd: 38.8,
    voiceDuration: 7.75,
    fps: 30,
  });
  assert.equal(timing.sourceStart, 31);
  assert.equal(timing.sourceEnd, 38.8);
  assert.equal(timing.frameCount, 234);
  assert.equal(timing.duration, 7.8);
  assert.equal(timing.renderSourceEnd, 38.8);
  assert.ok(timing.renderSourceEnd! <= timing.sourceEnd);
});

test('removes sub-frame remainder so adjacent scene boundaries cannot accumulate drift', () => {
  const timing = resolveSceneTiming({
    sceneId: 'portrait-page',
    sourceType: 'video',
    sourceStart: 6.122,
    sourceEnd: 14.126,
    voiceDuration: 6,
    fps: 30,
  });
  assert.equal(timing.frameCount, 240);
  assert.equal(timing.duration, 8);
  assert.equal(timing.renderSourceEnd, 14.122);
  assert.equal(timing.sourceEnd, 14.126);
});

test('lets a still image follow narration duration', () => {
  const timing = resolveSceneTiming({
    sceneId: 'diagram',
    sourceType: 'image',
    sourceStart: 0,
    sourceEnd: 1,
    voiceDuration: 6.001,
    fps: 30,
  });
  assert.equal(timing.duration, 181 / 30);
  assert.equal(timing.frameCount, 181);
  assert.equal(timing.renderSourceEnd, null);
});

test('rejects a selected video window beyond the real media duration', () => {
  assert.throws(() => validateVideoWindow({
    sceneId: 'positioning',
    sourceDuration: 12.5,
    sourceStart: 5,
    sourceEnd: 13,
  }), /exceeds the real media duration/);
});

test('accepts a selected video window inside the real media duration', () => {
  assert.deepEqual(validateVideoWindow({
    sceneId: 'positioning',
    sourceDuration: 15,
    sourceStart: 5,
    sourceEnd: 13,
  }), {
    sourceDuration: 15,
    sourceStart: 5,
    sourceEnd: 13,
  });
});
