import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChapterFingerprints,
  buildSemanticReviewReuse,
  validateChapterFingerprintManifest,
} from '../scripts/lib/chapter-fingerprints.mjs';

function fixture() {
  return {
    project: {
      brief: { targetDurationSeconds: 600 },
      chapters: [
        { id: 'chapter-01', order: 0, title: '一', summary: '一', sceneIds: ['scene-01'] },
        { id: 'chapter-02', order: 1, title: '二', summary: '二', sceneIds: ['scene-02'] },
      ],
      scenes: [
        { id: 'scene-01', chapterId: 'chapter-01', enabled: true, narration: '第一章。', eyebrow: '', title: '一', subtitle: '一', visualRequirement: '一', sourceReferences: [], sourceId: 'source-01', sourceStart: 0, sourceEnd: 10, selectedCandidateId: 'candidate-01' },
        { id: 'scene-02', chapterId: 'chapter-02', enabled: true, narration: '第二章。', eyebrow: '', title: '二', subtitle: '二', visualRequirement: '二', sourceReferences: [], sourceId: 'source-02', sourceStart: 0, sourceEnd: 10, selectedCandidateId: 'candidate-02' },
      ],
    },
    renderPlan: {
      scenes: [
        { id: 'scene-01', cacheKey: 'cache-01', segmentSha256: 'segment-01', frameCount: 300, descriptor: { source: { sha256: 'source-01' }, audioSha256: 'audio-01', duration: 10 } },
        { id: 'scene-02', cacheKey: 'cache-02', segmentSha256: 'segment-02', frameCount: 300, descriptor: { source: { sha256: 'source-02' }, audioSha256: 'audio-02', duration: 10 } },
      ],
    },
    renderSettings: { width: 1920, height: 1080, fps: 30, mediaBackground: 'solid' },
    voiceSettings: { engine: 'gemini-tts', voice: 'Charon', pronunciations: [] },
  };
}

test('chapter fingerprints isolate a narration change to its chapter', () => {
  const input = fixture();
  const before = buildChapterFingerprints(input);
  input.project.scenes[1].narration = '第二章已修改。';
  const after = buildChapterFingerprints(input);
  assert.equal(before.chapters[0].fingerprint, after.chapters[0].fingerprint);
  assert.notEqual(before.chapters[1].fingerprint, after.chapters[1].fingerprint);
});

test('semantic review reuse keeps only unchanged fully reviewed chapters', () => {
  const input = fixture();
  const before = buildChapterFingerprints(input);
  const previous = {
    chapterFingerprints: before,
    acceptance: {
      videoSha256: 'old-video',
      semantic: {
        status: 'passed', checkedAt: '2026-07-23T00:00:00.000Z', reviewer: 'codex',
        scenes: [
          { sceneId: 'scene-01', status: 'passed', note: '第一章画面与旁白已经逐项复核通过。' },
          { sceneId: 'scene-02', status: 'passed', note: '第二章画面与旁白已经逐项复核通过。' },
        ],
      },
    },
  };
  input.project.scenes[1].narration = '第二章已修改。';
  const current = buildChapterFingerprints(input);
  const reuse = buildSemanticReviewReuse(previous, current);
  assert.deepEqual(reuse.reusedChapterIds, ['chapter-01']);
  assert.deepEqual(reuse.invalidatedChapterIds, ['chapter-02']);
  assert.deepEqual(reuse.reusedSceneReviews.map((review) => review.sceneId), ['scene-01']);
  assert.equal(reuse.reusedDurationSeconds, 10);
  assert.equal(reuse.changedDurationSeconds, 10);
});

test('long-form proof rejects a tampered chapter fingerprint contract', () => {
  const input = fixture();
  const chapterFingerprints = buildChapterFingerprints(input);
  const manifest = {
    render: {
      ...input.renderSettings,
      mediaFit: undefined,
      renderStrategy: undefined,
      voiceEngine: input.voiceSettings.engine,
      voice: input.voiceSettings.voice,
      pronunciations: [],
    },
    chapterFingerprints,
    semanticReviewReuse: {
      reusedChapterIds: [],
      invalidatedChapterIds: ['chapter-01', 'chapter-02'],
      reusedSceneReviews: [],
    },
  };
  assert.deepEqual(validateChapterFingerprintManifest({
    project: input.project,
    renderPlan: input.renderPlan,
    manifest,
  }), []);
  manifest.chapterFingerprints.chapters[0].fingerprint = 'tampered';
  assert.match(validateChapterFingerprintManifest({
    project: input.project,
    renderPlan: input.renderPlan,
    manifest,
  }).join(' '), /do not match/);
});
