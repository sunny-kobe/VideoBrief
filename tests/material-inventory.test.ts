import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMaterialInventory } from '../scripts/lib/material-inventory.mjs';

test('material inventory keeps preview metadata and every candidate-to-scene relationship', () => {
  const project = {
    id: 'inventory-fixture',
    materialReview: { status: 'approved', approvedSourceIds: ['source-01'], reviewedAt: 'now' },
    materialQualityReview: {
      schemaVersion: 1, status: 'failed', reviewedAt: 'now', reviewer: 'codex', reviewScope: '逐幕复核', sceneReviews: [],
    },
    sources: [{
      id: 'source-01', label: '自有操作录屏', sourceType: 'video', materialRole: 'official_demo',
      originalFileName: 'demo.mp4', originUrl: 'https://example.com/demo', assetPath: 'public/demo.mp4',
      verificationStatus: 'verified', rightsStatus: 'cleared', rightsNote: '自有素材', contentHash: 'hash',
      reusedFrom: null, processing: { status: 'completed' }, analysis: { facts: [], uncertainties: [] },
    }],
    scenes: [{
      id: 'scene-01', title: '真实操作', narration: '展示真实操作。', visualRequirement: '显示操作结果',
      selectedCandidateId: 'candidate-02', selectionStatus: 'codex_reviewed',
      candidates: [
        { id: 'candidate-01', sourceId: 'source-01', sourceStart: 1, sourceEnd: 4, matchReason: '备选开场', rightsStatus: 'cleared' },
        { id: 'candidate-02', sourceId: 'source-01', sourceStart: 5, sourceEnd: 9, matchReason: '直接显示结果', rightsStatus: 'cleared' },
      ],
    }],
  } as never;

  const inventory = buildMaterialInventory(project);
  assert.equal(inventory.materialQualityReview?.status, 'failed');
  assert.equal(inventory.sources[0].assetPath, 'public/demo.mp4');
  assert.equal(inventory.sources[0].plannedWindows.length, 2);
  assert.deepEqual(inventory.sources[0].plannedWindows.map((window) => ({
    sceneId: window.sceneId,
    candidateId: window.candidateId,
    selected: window.selected,
    matchReason: window.matchReason,
  })), [
    { sceneId: 'scene-01', candidateId: 'candidate-01', selected: false, matchReason: '备选开场' },
    { sceneId: 'scene-01', candidateId: 'candidate-02', selected: true, matchReason: '直接显示结果' },
  ]);
});
