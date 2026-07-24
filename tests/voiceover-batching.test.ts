import assert from 'node:assert/strict';
import test from 'node:test';

import { planVoiceoverBatches } from '../scripts/lib/voiceover-batching.mjs';

test('short videos keep one continuous voice batch', () => {
  const scenes = [{ id: 'scene-01' }, { id: 'scene-02' }];
  const batches = planVoiceoverBatches(scenes, [], 60);
  assert.deepEqual(batches.map((batch) => batch.id), ['full-video']);
  assert.deepEqual(batches[0].entries.map((entry) => entry.index), [0, 1]);
});

test('long videos generate one continuous batch per ordered chapter', () => {
  const scenes = [
    { id: 'scene-01', chapterId: 'chapter-01' },
    { id: 'scene-02', chapterId: 'chapter-01' },
    { id: 'scene-03', chapterId: 'chapter-02' },
  ];
  const chapters = [
    { id: 'chapter-02', order: 1 },
    { id: 'chapter-01', order: 0 },
  ];
  const batches = planVoiceoverBatches(scenes, chapters, 600);
  assert.deepEqual(batches.map((batch) => batch.id), ['chapter-01', 'chapter-02']);
  assert.deepEqual(batches.map((batch) => batch.entries.map((entry) => entry.index)), [[0, 1], [2]]);
});

test('long-form voice batching rejects scenes outside canonical chapters', () => {
  assert.throws(
    () => planVoiceoverBatches([{ id: 'scene-01', chapterId: '' }], [{ id: 'chapter-01', order: 0 }], 600),
    /missing a canonical chapter/,
  );
});
