import assert from 'node:assert/strict';
import test from 'node:test';
import {
  automaticSourceReadiness,
  materialReviewReadiness,
  sceneSelectionReadiness,
  sourceIdsRequiringAutomaticProcessing,
} from '../src/productionReadiness';
import type { ShortVideoProjectScene, ShortVideoSource } from '../src/shortVideoBrief';

test('allows automatic production when a failed source is accompanied by completed evidence', () => {
  assert.deepEqual(automaticSourceReadiness(['failed', 'completed']), { ready: true, reason: '' });
});

test('blocks automatic production while any source is unfinished', () => {
  assert.equal(automaticSourceReadiness(['completed', 'running']).ready, false);
  assert.equal(automaticSourceReadiness(['completed', 'idle']).ready, false);
  assert.equal(automaticSourceReadiness(['completed', 'pending']).ready, false);
});

test('blocks automatic production when every source failed', () => {
  assert.deepEqual(automaticSourceReadiness(['failed']), {
    ready: false,
    reason: '没有素材成功完成解析。',
  });
});

test('queues only unfinished sources and leaves completed or explicitly failed evidence alone', () => {
  const sources = [
    { id: 'idle', processing: { status: 'idle' } },
    { id: 'pending', processing: { status: 'pending' } },
    { id: 'running', processing: { status: 'running' } },
    { id: 'completed', processing: { status: 'completed' } },
    { id: 'failed', processing: { status: 'failed' } },
  ] as Array<Pick<ShortVideoSource, 'id' | 'processing'>>;
  assert.deepEqual(sourceIdsRequiringAutomaticProcessing(sources), ['idle', 'pending', 'running']);
});

const source = (
  id: string,
  sourceType: 'audio' | 'image' | 'video',
  rightsStatus: 'cleared' | 'blocked' = 'cleared',
) => ({
  id,
  sourceType,
  rightsStatus,
  materialRole: 'official_demo',
}) as ShortVideoSource;

test('blocks production until the material package is explicitly approved', () => {
  assert.equal(materialReviewReadiness(
    { status: 'pending', approvedSourceIds: ['video-1'], reviewedAt: '' },
    [source('video-1', 'video')],
  ).ready, false);
});

test('allows an approved image-only material package', () => {
  assert.deepEqual(materialReviewReadiness(
    { status: 'approved', approvedSourceIds: ['image-1'], reviewedAt: new Date().toISOString() },
    [source('image-1', 'image')],
  ), { ready: true, reason: '' });
});

test('blocks an approved audio-only material package without a visual source', () => {
  assert.deepEqual(materialReviewReadiness(
    { status: 'approved', approvedSourceIds: ['audio-1'], reviewedAt: new Date().toISOString() },
    [source('audio-1', 'audio')],
  ), {
    ready: false,
    reason: '已确认的素材包中没有可用于画面的图片或视频。',
  });
});

test('allows an approved package containing video and supplemental images', () => {
  assert.equal(materialReviewReadiness(
    { status: 'approved', approvedSourceIds: ['video-1', 'image-1'], reviewedAt: new Date().toISOString() },
    [source('video-1', 'video'), source('image-1', 'image')],
  ).ready, true);
});

test('blocks a similar-project reference video from entering the final cut', () => {
  assert.deepEqual(materialReviewReadiness(
    { status: 'approved', approvedSourceIds: ['reference-1'], reviewedAt: new Date().toISOString() },
    [{ ...source('reference-1', 'video'), materialRole: 'research' }],
  ), {
    ready: false,
    reason: '已确认的素材包中包含仅供研究参考的素材。',
  });
});

function scene(overrides: Partial<ShortVideoProjectScene> = {}) {
  return {
    id: 'scene-1',
    title: 'Evidence',
    enabled: true,
    sourceId: 'video-1',
    sourceStart: 3,
    sourceEnd: 9,
    selectedCandidateId: 'candidate-1',
    selectionStatus: 'codex_reviewed',
    candidates: [{
      id: 'candidate-1',
      sourceId: 'video-1',
      sourceStart: 3,
      sourceEnd: 9,
    }],
    ...overrides,
  } as ShortVideoProjectScene;
}

test('blocks an AI-suggested scene before production render', () => {
  const result = sceneSelectionReadiness(
    [scene({ selectionStatus: 'ai_suggested' })],
    ['video-1'],
  );
  assert.equal(result.ready, false);
  assert.match(result.reason, /AI 推荐/);
});

test('blocks a reviewed scene whose selected window drifted from its candidate', () => {
  const result = sceneSelectionReadiness(
    [scene({ sourceEnd: 8.5 })],
    ['video-1'],
  );
  assert.equal(result.ready, false);
  assert.match(result.reason, /sourceId\/sourceStart\/sourceEnd/);
});

test('allows a reviewed scene with an exact selected candidate window', () => {
  assert.deepEqual(sceneSelectionReadiness([scene()], ['video-1']), { ready: true, reason: '' });
});
