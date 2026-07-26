import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyProductionWorkflowAction,
  nextProductionWorkflowAutomaticAction,
  parseProductionWorkflowAction,
  productionWorkflowSnapshot,
  researchGateReadiness,
  type WorkflowRuntimeEvidence,
} from '../src/productionWorkflow';
import { normalizeBrief } from '../src/shortVideoProjectServer';
import { topicApprovalFingerprint } from '../scripts/lib/production-workflow-contract.mjs';

const readyRuntime: WorkflowRuntimeEvidence = {
  renderState: 'ready',
  acceptancePassed: true,
  packageReady: true,
  videoSha256: 'video-sha',
  packageSha256: 'package-sha',
};

function fixture() {
  const project = normalizeBrief({
    schemaVersion: 3,
    id: 'workflow-fixture',
    title: '端到端流程测试',
    technical_status: 'passed',
    rights_status: 'cleared',
    publication_status: 'draft-unpublished',
    market_status: 'none',
    brief: {
      objective: '验证完整生产 Gate', audience: '测试用户', platform: '测试平台',
      aspectRatio: '9:16', targetDurationSeconds: 45, tone: '清晰', style: '真实',
      reference: '', coreMessage: '每个关键决策都必须有证据', cta: '完成验证', prohibitedMaterial: '',
    },
    sources: [{
      id: 'source-01', label: '自有录屏', sourceType: 'video', materialRole: 'official_demo',
      originUrl: '', assetPath: 'public/project-assets/workflow-fixture/source.mp4',
      verificationStatus: 'verified', rightsStatus: 'cleared', rightsNote: '测试自有素材',
      contentHash: 'source-sha',
      processing: { status: 'completed', stage: 'completed' },
      analysis: { facts: [], uncertainties: [] },
    }],
    research: {
      transcripts: [],
      facts: [{
        id: 'fact-01', statement: '关键事实', sourceReferences: [{ sourceId: 'source-01', locatorType: 'time', start: 0, end: 3, note: '测试片段' }],
        reviewStatus: 'confirmed', kind: 'claim', reviewPriority: 'required', briefRelevance: 100,
      }],
      uncertainties: [{
        id: 'risk-01', statement: '测试风险', sourceReferences: [{ sourceId: 'source-01', locatorType: 'file', note: '测试素材' }],
        resolution: '已由测试人员核对', riskLevel: 'high', reviewPriority: 'required', briefRelevance: 100,
      }],
    },
    materialReview: { status: 'approved', approvedSourceIds: ['source-01'], reviewedAt: '2026-07-24T00:00:00.000Z' },
    narrative: {
      status: 'completed', activeVersionId: 'narrative-01', versions: [], pendingDraft: null,
      pendingScenes: [], pendingChapters: [], error: '', generatedAt: '', model: '', promptVersion: '',
    },
    scenes: [{
      id: 'scene-01', enabled: true, sourceId: 'source-01', sourceStart: 0, sourceEnd: 3,
      title: '测试场景', narration: '关键事实。', visualRequirement: '显示关键事实',
      candidates: [{
        id: 'candidate-01', sourceId: 'source-01', assetPath: 'public/project-assets/workflow-fixture/source.mp4',
        mediaType: 'video', sourceStart: 0, sourceEnd: 3, matchReason: '画面与旁白一致', rightsStatus: 'cleared',
      }],
      selectedCandidateId: 'candidate-01', selectionStatus: 'user_approved',
    }],
    workflow: {
      schemaVersion: 1,
      origin: { kind: 'manual', runId: '', candidateId: '', sourceUrl: '', score: null, summary: '' },
      topicApproval: { status: 'approved', decidedAt: 'now', decidedBy: 'test-user', note: '测试用户明确批准该命题', fingerprint: 'workflow-fixture' },
      researchApproval: { status: 'pending', decidedAt: '', decidedBy: '', note: '', fingerprint: '' },
      deliveryApproval: { status: 'pending', decidedAt: '', decidedBy: '', note: '', fingerprint: '' },
      publication: {
        approval: { status: 'pending', decidedAt: '', decidedBy: '', note: '', fingerprint: '' },
        platform: '', publishedUrl: '', publishedAt: '', videoSha256: '', packageSha256: '',
      },
      market: { decision: 'pending', decidedAt: '', decidedBy: '', note: '', evidence: [] },
    },
  } as unknown as Parameters<typeof normalizeBrief>[0]);
  project.workflow.topicApproval.fingerprint = topicApprovalFingerprint(project);
  return project;
}

function approveResearch(project = fixture()) {
  return applyProductionWorkflowAction(project, readyRuntime, {
    type: 'approve_research', decidedBy: 'test-user', note: '已逐条核对关键事实和高风险问题。',
  }, '2026-07-24T01:00:00.000Z');
}

function approveDelivery(project = approveResearch()) {
  return applyProductionWorkflowAction(project, readyRuntime, {
    type: 'approve_delivery', decidedBy: 'test-user', note: '已按一倍速完整观看并确认画面语义。',
  }, '2026-07-24T02:00:00.000Z');
}

test('research approval is blocked while a required fact is pending', () => {
  const project = fixture();
  project.research.facts[0].reviewStatus = 'proposed';
  assert.equal(researchGateReadiness(project).ready, false);
  assert.throws(() => applyProductionWorkflowAction(project, readyRuntime, {
    type: 'approve_research', decidedBy: 'test-user', note: '尝试批准尚未完成的研究内容。',
  }), /关键事实待确认/);
});

test('research approval requires at least one confirmed key fact', () => {
  const project = fixture();
  project.research.facts[0].reviewStatus = 'rejected';
  assert.throws(() => applyProductionWorkflowAction(project, readyRuntime, {
    type: 'approve_research', decidedBy: 'test-user', note: '全部事实驳回后不能批准研究结论。',
  }), /至少需要一条已确认/);
});

test('normalization preserves an explicitly approved image-only material package', () => {
  const input = fixture();
  input.sources[0].sourceType = 'image';
  input.sources[0].assetPath = 'public/project-assets/workflow-fixture/source.png';
  input.scenes[0].candidates[0].mediaType = 'image';
  input.scenes[0].candidates[0].assetPath = input.sources[0].assetPath;
  const project = normalizeBrief(input);
  assert.equal(project.materialReview.status, 'approved');
  assert.deepEqual(project.materialReview.approvedSourceIds, ['source-01']);
});

test('workflow action parser rejects unknown or extra input fields', () => {
  assert.throws(() => parseProductionWorkflowAction({
    type: 'approve_topic', decidedBy: 'test-user', note: '测试用户确认当前命题可以继续。', elevated: true,
  }), /参数无效/);
  assert.throws(() => parseProductionWorkflowAction({ type: 'delete_project' }), /参数无效/);
});

test('topic approval is invalidated when the creative brief changes', () => {
  const project = fixture();
  project.brief.coreMessage = '已经变更为另一个命题';
  assert.throws(() => applyProductionWorkflowAction(project, readyRuntime, {
    type: 'approve_research', decidedBy: 'test-user', note: '命题发生变化后不能沿用旧批准记录。',
  }), /最终命题 Gate/);
});

test('human gates reject AI signatures and bind approval to current evidence', () => {
  assert.throws(() => applyProductionWorkflowAction(fixture(), readyRuntime, {
    type: 'approve_research', decidedBy: 'codex', note: '由模型自行批准研究内容不应被接受。',
  }), /真实人工批准者/);
  const project = approveDelivery();
  assert.equal(productionWorkflowSnapshot(project, readyRuntime).stages.find((stage) => stage.id === 'acceptance')?.status, 'approved');
  assert.notEqual(
    productionWorkflowSnapshot(project, { ...readyRuntime, videoSha256: 'changed-video' }).stages.find((stage) => stage.id === 'acceptance')?.status,
    'approved',
  );
});

test('automatic workflow advances only between explicit human gates', () => {
  const processing = fixture();
  processing.sources[0].processing.status = 'idle';
  assert.equal(nextProductionWorkflowAutomaticAction(processing, readyRuntime), 'process_sources');

  processing.materialReview = { status: 'pending', approvedSourceIds: [], reviewedAt: '' };
  assert.equal(
    nextProductionWorkflowAutomaticAction(processing, readyRuntime),
    'process_sources',
    'source understanding must run before asking the user to approve the material package',
  );

  const approved = approveResearch();
  const needsPlan = structuredClone(approved);
  needsPlan.narrative.activeVersionId = '';
  needsPlan.scenes = [];
  assert.equal(nextProductionWorkflowAutomaticAction(needsPlan, readyRuntime), 'plan_project');
  assert.equal(nextProductionWorkflowAutomaticAction(approved, {
    ...readyRuntime, renderState: 'missing', acceptancePassed: false, packageReady: false,
  }), 'render');
  assert.equal(nextProductionWorkflowAutomaticAction(approved, {
    ...readyRuntime, acceptancePassed: false, packageReady: false,
  }), null);
  assert.equal(nextProductionWorkflowAutomaticAction(approveDelivery(), {
    ...readyRuntime, packageReady: false, packageSha256: '',
  }), 'package');
});

test('publication requires cleared rights, a current package and delivery approval', () => {
  const project = approveDelivery();
  const blocked = { ...project, rights_status: 'review_required' as const };
  assert.equal(
    productionWorkflowSnapshot(blocked, readyRuntime).stages.find((stage) => stage.id === 'publication')?.status,
    'blocked',
  );
  assert.match(
    productionWorkflowSnapshot(blocked, readyRuntime).stages.find((stage) => stage.id === 'publication')?.message ?? '',
    /rights_status=review_required/,
  );
  assert.throws(() => applyProductionWorkflowAction(blocked, readyRuntime, {
    type: 'approve_publication', decidedBy: 'test-user', note: '尝试在未清权状态批准正式发布。', platform: '测试平台',
  }), /尚未全部 cleared/);
  assert.throws(() => applyProductionWorkflowAction(project, { ...readyRuntime, packageReady: false }, {
    type: 'approve_publication', decidedBy: 'test-user', note: '尝试在导出包过期时批准正式发布。', platform: '测试平台',
  }), /production package/);
});

test('stale publication approval returns to the publication Gate', () => {
  const delivered = approveDelivery();
  const approved = applyProductionWorkflowAction(delivered, readyRuntime, {
    type: 'approve_publication', decidedBy: 'test-user', note: '当前交付包与权利状态均已人工复核。', platform: '测试平台',
  });
  const changedPackage = { ...readyRuntime, packageSha256: 'changed-package' };
  const publication = productionWorkflowSnapshot(approved, changedPackage).stages.find((stage) => stage.id === 'publication');
  assert.equal(publication?.status, 'ready');
  assert.equal(productionWorkflowSnapshot(approved, changedPackage).next?.id, 'publication');
});

test('published does not become validated without real evidence and a human decision', () => {
  let project = approveDelivery();
  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'approve_publication', decidedBy: 'test-user', note: '权利和当前导出包均已复核，可以人工发布。', platform: '测试平台',
  });
  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'record_publication', publishedUrl: 'https://example.com/posts/real-video', publishedAt: '2026-07-24T03:00:00.000Z',
  });
  assert.equal(project.publication_status, 'published');
  assert.equal(project.market_status, 'collecting');
  assert.throws(() => applyProductionWorkflowAction(project, readyRuntime, {
    type: 'decide_market', decidedBy: 'test-user', note: '没有证据时不能形成市场验证结论。', decision: 'validated',
  }), /没有真实市场证据/);

  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'record_market_evidence',
    evidence: {
      source: '测试平台后台', sourceUrl: 'https://example.com/analytics/real-video', metric: '完整播放',
      value: 42, unit: '次', periodStart: '2026-07-24T03:00:00.000Z', periodEnd: '2026-07-25T03:00:00.000Z', note: '真实后台导出的首日数据',
    },
  });
  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'decide_market', decidedBy: 'test-user', note: '根据真实播放和互动数据确认达到本轮验证标准。', decision: 'validated',
  });
  assert.equal(project.market_status, 'validated');
  assert.equal(project.workflow.market.decision, 'validated');
});

test('negative and inconclusive market decisions remain visible in the top-level status', () => {
  for (const decision of ['not_validated', 'inconclusive'] as const) {
    let project = approveDelivery();
    project = applyProductionWorkflowAction(project, readyRuntime, {
      type: 'approve_publication', decidedBy: 'test-user', note: '权利和当前导出包均已复核，可以人工发布。', platform: '测试平台',
    });
    project = applyProductionWorkflowAction(project, readyRuntime, {
      type: 'record_publication', publishedUrl: `https://example.com/posts/${decision}`, publishedAt: '2026-07-24T03:00:00.000Z',
    });
    project = applyProductionWorkflowAction(project, readyRuntime, {
      type: 'record_market_evidence',
      evidence: {
        source: '测试平台后台', sourceUrl: '', metric: '完整播放', value: 3, unit: '次',
        periodStart: '', periodEnd: '', note: '未达到验证阈值的真实数据',
      },
    });
    project = applyProductionWorkflowAction(project, readyRuntime, {
      type: 'decide_market', decidedBy: 'test-user', note: '根据当前真实数据形成保守的市场验证结论。', decision,
    });
    assert.equal(project.market_status, decision);
    assert.equal(project.workflow.market.decision, decision);
  }
});

test('market evidence rejects incomplete or reversed measurement periods', () => {
  let project = approveDelivery();
  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'approve_publication', decidedBy: 'test-user', note: '权利和当前导出包均已复核，可以人工发布。', platform: '测试平台',
  });
  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'record_publication', publishedUrl: 'https://example.com/posts/period-test', publishedAt: '2026-07-24T03:00:00.000Z',
  });
  const baseEvidence = {
    source: '测试平台后台', sourceUrl: '', metric: '完整播放', value: 10, unit: '次', note: '',
  };
  assert.throws(() => applyProductionWorkflowAction(project, readyRuntime, {
    type: 'record_market_evidence',
    evidence: { ...baseEvidence, periodStart: '2026-07-24T03:00:00.000Z', periodEnd: '' },
  }), /必须同时包含/);
  assert.throws(() => applyProductionWorkflowAction(project, readyRuntime, {
    type: 'record_market_evidence',
    evidence: {
      ...baseEvidence,
      periodStart: '2026-07-25T03:00:00.000Z',
      periodEnd: '2026-07-24T03:00:00.000Z',
    },
  }), /结束时间不能早于开始时间/);
});
