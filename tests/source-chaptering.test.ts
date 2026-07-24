import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canReuseCompletedSourceChapter,
  HIGH_CONFIDENCE_SCENE_THRESHOLD,
  LONG_SOURCE_THRESHOLD_SECONDS,
  MAX_CHAPTER_FRAME_SAMPLES,
  needsStructuralSceneFallback,
  normalizeDetectedSceneChanges,
  planChapterFrameSamples,
  planSourceChapters,
  sourceChapterResumeKey,
  STRUCTURAL_SCENE_THRESHOLD,
  targetChapterFrameSampleCount,
} from '../src/sourceChaptering';

test('keeps a short source as one compatibility chapter', () => {
  assert.deepEqual(planSourceChapters(LONG_SOURCE_THRESHOLD_SECONDS), [{
    id: 'chapter-01',
    index: 0,
    start: 0,
    end: LONG_SOURCE_THRESHOLD_SECONDS,
  }]);
});

test('splits a long source into contiguous bounded chapters and prefers structural boundaries', () => {
  const chapters = planSourceChapters(
    620,
    [148, 304, 452],
    [150, 300, 450, 600],
  );
  assert.deepEqual(chapters.map((chapter) => [chapter.start, chapter.end]), [
    [0, 148],
    [148, 304],
    [304, 452],
    [452, 620],
  ]);
  assert.ok(chapters.every((chapter, index) => (
    index === 0 || chapter.start === chapters[index - 1].end
  )));
  assert.ok(chapters.every((chapter) => chapter.end - chapter.start >= 75));
  assert.ok(chapters.every((chapter) => chapter.end - chapter.start <= 180));
});

test('chapter-local frame samples scale with duration and preserve distributed scene changes', () => {
  const chapter = { id: 'chapter-02', index: 1, start: 150, end: 300 };
  const frames = planChapterFrameSamples(chapter, [170, 224, 260, 310]);
  assert.equal(frames.length, targetChapterFrameSampleCount(150, 3));
  assert.ok(frames.length > 6);
  assert.ok(frames.some((frame) => frame.ratio === 0.05));
  assert.ok(frames.some((frame) => frame.ratio === 0.95));
  assert.ok(frames.some((frame) => frame.reason === 'scene-change'));
  assert.ok(frames.every((frame) => frame.second >= chapter.start && frame.second <= chapter.end));
});

test('dense chapters add scene-change evidence without exceeding the per-request cap', () => {
  const chapter = { id: 'chapter-01', index: 0, start: 0, end: 180 };
  const sceneChanges = Array.from({ length: 60 }, (_, index) => (index + 1) * 2.9);
  const frames = planChapterFrameSamples(chapter, sceneChanges);
  assert.equal(frames.length, MAX_CHAPTER_FRAME_SAMPLES);
  assert.ok(frames.filter((frame) => frame.reason === 'scene-change').length >= 6);
  assert.ok(frames.some((frame) => frame.second < 60 && frame.reason === 'scene-change'));
  assert.ok(frames.some((frame) => frame.second > 120 && frame.reason === 'scene-change'));
});

test('sparse high-confidence detection triggers a lower structural threshold', () => {
  assert.ok(HIGH_CONFIDENCE_SCENE_THRESHOLD > STRUCTURAL_SCENE_THRESHOLD);
  assert.equal(needsStructuralSceneFallback(480, 0), true);
  assert.equal(needsStructuralSceneFallback(480, 4), false);
  assert.equal(needsStructuralSceneFallback(60, 1), false);
});

test('structural scene changes are debounced and bounded without losing coverage', () => {
  const noisy = [
    -1, 0, 15, 15.1, 30, 30.2, 45, 60, 75, 90, 105, 120, 121, 480, 999,
  ];
  assert.deepEqual(normalizeDetectedSceneChanges(noisy, 480), [
    15, 30, 45, 60, 75, 90, 105, 120, 121,
  ]);
  assert.deepEqual(normalizeDetectedSceneChanges(noisy, 480, { maximumCount: 3 }), [
    15, 75, 121,
  ]);
});

test('chapter resume keys invalidate only when an analysis input changes', () => {
  const input = {
    sourceHash: 'source-hash',
    model: 'model-a',
    promptVersion: 'prompt-a',
    brief: { objective: 'Explain the project' },
    plan: { start: 150, end: 300 },
    transcriptText: '[150-151] text',
    frameSeconds: [157.5, 225, 292.5],
  };
  const key = sourceChapterResumeKey(input);
  assert.equal(sourceChapterResumeKey({ ...input }), key);
  assert.notEqual(sourceChapterResumeKey({ ...input, transcriptText: '[150-151] changed' }), key);
  assert.equal(canReuseCompletedSourceChapter({
    start: 150,
    end: 300,
    processing: { status: 'completed', resumeKey: key },
  }, input.plan, key), true);
  assert.equal(canReuseCompletedSourceChapter({
    start: 150,
    end: 299,
    processing: { status: 'completed', resumeKey: key },
  }, input.plan, key), false);
});
