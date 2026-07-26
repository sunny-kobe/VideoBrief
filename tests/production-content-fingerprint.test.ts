import assert from 'node:assert/strict';
import test from 'node:test';

import {
  packageContentFingerprint,
  productionContentFingerprint,
} from '../scripts/lib/production-content-fingerprint.mjs';

const project = {
  schemaVersion: 3,
  id: 'fingerprint-project',
  title: '指纹测试',
  status: 'draft',
  technical_status: 'passed',
  rights_status: 'cleared',
  publication_status: 'draft-unpublished',
  market_status: 'none',
  brief: { objective: '验证元数据与生产输入分离' },
  sources: [{
    id: 'source-01', sourceType: 'image', assetPath: 'source.png', contentHash: 'source-hash',
    rightsStatus: 'review_required', rightsNote: '等待确认', verificationStatus: 'unverified',
    processing: { status: 'completed', inputHash: 'source-hash', completedAt: 'first' },
  }],
  scenes: [{
    id: 'scene-01', narration: '第一版旁白', selectionStatus: 'codex_reviewed',
    selectionReviewedAt: 'first', selectionNote: '已复核', candidates: [{ id: 'candidate-01', rightsStatus: 'review_required' }],
  }],
  production: { renderAttemptCount: 1 },
  workflow: { publication: { status: 'pending' } },
};

test('publication and workflow metadata do not invalidate production content', () => {
  const before = productionContentFingerprint(project);
  const after = productionContentFingerprint({
    ...project,
    status: 'published',
    publication_status: 'published',
    market_status: 'collecting',
    production: { renderAttemptCount: 3 },
    workflow: { publication: { status: 'approved' } },
  });
  assert.equal(after, before);
});

test('creative or source changes invalidate production content', () => {
  const before = productionContentFingerprint(project);
  assert.notEqual(
    productionContentFingerprint({ ...project, brief: { objective: '新的创作目标' } }),
    before,
  );
  assert.notEqual(
    productionContentFingerprint({ ...project, scenes: [{ id: 'scene-01', narration: '第二版旁白' }] }),
    before,
  );
  assert.notEqual(
    productionContentFingerprint({ ...project, sources: [{ id: 'source-01', contentHash: 'changed' }] }),
    before,
  );
});

test('rights and review metadata only invalidate the package, not rendered video', () => {
  const renderBefore = productionContentFingerprint(project);
  const packageBefore = packageContentFingerprint(project);
  const changed = structuredClone(project);
  changed.rights_status = 'cleared';
  changed.sources[0].rightsStatus = 'cleared';
  changed.sources[0].rightsNote = '自有素材，已完成清权';
  changed.sources[0].verificationStatus = 'verified';
  changed.sources[0].processing.completedAt = 'later';
  changed.scenes[0].selectionStatus = 'user_approved';
  changed.scenes[0].selectionReviewedAt = 'later';
  changed.scenes[0].selectionNote = '用户确认';
  changed.scenes[0].candidates[0].rightsStatus = 'cleared';
  assert.equal(productionContentFingerprint(changed), renderBefore);
  assert.notEqual(packageContentFingerprint(changed), packageBefore);
});
