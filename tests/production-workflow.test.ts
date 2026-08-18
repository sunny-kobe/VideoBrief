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
import { aggregateProjectRightsStatus, normalizeBrief } from '../src/shortVideoProjectServer';
import {
  approvalIsCurrent,
  assertPreproductionGates,
  assertVoiceoverPreflightGates,
  preproductionGateReadiness,
  researchApprovalFingerprint,
  topicApprovalFingerprint,
  voiceoverPreflightGateReadiness,
} from '../scripts/lib/production-workflow-contract.mjs';
import { buildMaterialQualityReview } from '../scripts/lib/material-quality-gate.mjs';

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
  project.materialQualityReview = buildMaterialQualityReview(project, {
    projectId: project.id,
    reviewScope: '测试场景 start/mid/end 与桌面、移动视口。',
    reviews: [{
      sceneId: 'scene-01',
      candidate: { sourceId: 'source-01', sourceStart: 0, sourceEnd: 3 },
      visibleClaim: '测试素材直接显示关键事实。',
      evidenceRole: 'operation-demo',
      narrationMatch: { score: 3, reason: '画面与测试旁白一致。' },
      readability: {
        desktop: 'passed', mobile: 'passed', criticalText: ['关键事实'], reason: '测试视口可读。',
      },
      temporalCompleteness: { status: 'passed', reason: '测试窗口完整。' },
      stability: { status: 'stable', motionNecessary: false, reason: '固定测试镜头。' },
      uniqueness: { status: 'unique', reason: '仅承担当前测试观点。' },
      platformWatermark: { status: 'absent', marks: [], reason: '测试自有素材无平台或账号水印。' },
      decision: 'accept',
      decisionReasons: ['测试素材 Gate 通过'],
      evidence: ['scene-01-start.png', 'scene-01-mid.png', 'scene-01-end.png'],
    }],
  }, 'codex', '2026-07-24T00:30:00.000Z');
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

test('research approval precedes material approval and survives later visual sources', () => {
  const researchOnly = fixture();
  researchOnly.materialReview = { status: 'pending', approvedSourceIds: [], reviewedAt: '' };

  assert.equal(researchGateReadiness(researchOnly).ready, true);
  assert.equal(productionWorkflowSnapshot(researchOnly, readyRuntime).next?.id, 'research');

  const approved = approveResearch(researchOnly);
  assert.equal(productionWorkflowSnapshot(approved, readyRuntime).next?.id, 'materials');
  assert.equal(preproductionGateReadiness(approved).ready, false);
  assert.match(preproductionGateReadiness(approved).issues.join('；'), /素材包尚未明确批准/);

  const withMaterials = structuredClone(approved);
  withMaterials.sources.push({
    ...withMaterials.sources[0],
    id: 'source-02',
    label: '后续加入的自有动态录屏',
    materialRole: 'official_demo',
    contentHash: 'visual-source-sha',
    analysis: {
      ...withMaterials.sources[0].analysis,
      facts: [{
        id: 'visual-fact-01', statement: '画面包含状态变化', sourceReferences: [{ sourceId: 'source-02', locatorType: 'time', start: 0, end: 3, note: '动态画面' }],
        reviewStatus: 'confirmed', kind: 'visual_metadata', reviewPriority: 'supporting', briefRelevance: 70,
      }],
    },
  });
  withMaterials.materialReview = {
    status: 'approved',
    approvedSourceIds: ['source-02'],
    reviewedAt: '2026-07-24T01:30:00.000Z',
  };

  assert.equal(
    approvalIsCurrent(withMaterials.workflow.researchApproval, researchApprovalFingerprint(withMaterials)),
    true,
  );
  assert.equal(preproductionGateReadiness(withMaterials).ready, true);
});

test('production preflight rejects a failed material-quality Gate before rendering', () => {
  const project = approveResearch();
  project.materialQualityReview = {
    schemaVersion: 1,
    status: 'failed',
    reviewedAt: '2026-07-24T01:30:00.000Z',
    reviewer: 'codex',
    reviewScope: '逐幕 start/mid/end 与目标视口复核。',
    sceneReviews: [],
  };

  assert.throws(
    () => assertPreproductionGates(project),
    /素材质量 Gate 当前状态为 failed/,
  );
  assert.equal(voiceoverPreflightGateReadiness(project).ready, true);
  assert.doesNotThrow(() => assertVoiceoverPreflightGates(project));
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

test('normalization clamps scene playback rate to the supported production range', () => {
  const input = fixture();
  input.scenes[0].mediaPlaybackRate = 9;
  assert.equal(normalizeBrief(input).scenes[0].mediaPlaybackRate, 4);
  input.scenes[0].mediaPlaybackRate = 0.1;
  assert.equal(normalizeBrief(input).scenes[0].mediaPlaybackRate, 0.25);
});

test('project rights follow the approved material package instead of unused imports', () => {
  const project = fixture();
  project.sources.push({
    ...project.sources[0],
    id: 'source-unused',
    rightsStatus: 'review_required',
    materialRole: 'research',
  });

  assert.equal(
    aggregateProjectRightsStatus(project.sources, project.materialReview),
    'cleared',
  );
  assert.equal(
    aggregateProjectRightsStatus(project.sources, { status: 'pending', approvedSourceIds: [], reviewedAt: '' }),
    'review_required',
  );
  assert.equal(
    aggregateProjectRightsStatus(project.sources, {
      status: 'approved', approvedSourceIds: ['source-missing'], reviewedAt: 'now',
    }),
    'review_required',
  );
});

test('workflow action parser rejects unknown or extra input fields', () => {
  assert.throws(() => parseProductionWorkflowAction({
    type: 'approve_topic', decidedBy: 'test-user', note: '测试用户确认当前命题可以继续。', elevated: true,
  }), /参数无效/);
  assert.throws(() => parseProductionWorkflowAction({ type: 'delete_project' }), /参数无效/);
});

test('delivery decisions allow an omitted review note while other Gates still require one', () => {
  const action = parseProductionWorkflowAction({
    type: 'approve_delivery', decidedBy: 'local-user',
  });
  if (action.type !== 'approve_delivery') assert.fail('expected approve_delivery action');
  assert.equal(action.note, '');
  const project = applyProductionWorkflowAction(approveResearch(), readyRuntime, action);
  assert.equal(project.workflow.deliveryApproval.status, 'approved');
  assert.equal(project.workflow.deliveryApproval.note, '');
  assert.throws(() => applyProductionWorkflowAction(fixture(), readyRuntime, {
    type: 'approve_research', decidedBy: 'test-user', note: '',
  }), /至少需要/);
});

test('delivery rejection remains bound to the current video and blocks packaging after refresh', () => {
  const runtimeWithoutPackage = { ...readyRuntime, packageReady: false, packageSha256: '' };
  const project = applyProductionWorkflowAction(approveResearch(), runtimeWithoutPackage, {
    type: 'reject_delivery',
    decidedBy: 'test-user',
    note: '命题不好看，看不懂，没啥吸引人。',
  });
  const snapshot = productionWorkflowSnapshot(project, runtimeWithoutPackage);
  const acceptance = snapshot.stages.find((stage) => stage.id === 'acceptance');
  const packaging = snapshot.stages.find((stage) => stage.id === 'package');

  assert.equal(acceptance?.status, 'blocked');
  assert.equal(acceptance?.message, '命题不好看，看不懂，没啥吸引人。');
  assert.equal(packaging?.status, 'waiting');
  assert.equal(snapshot.next?.id, 'acceptance');
});

test('automatic acceptance cannot expose Delivery Gate before prior production Gates pass', () => {
  const pending = fixture();
  pending.workflow.topicApproval = {
    status: 'pending', decidedAt: '', decidedBy: '', note: '', fingerprint: '',
  };
  const snapshot = productionWorkflowSnapshot(pending, readyRuntime);
  assert.equal(snapshot.next?.id, 'topic');
  assert.equal(snapshot.stages.find((stage) => stage.id === 'acceptance')?.status, 'waiting');

  const missingQuality = approveResearch();
  missingQuality.materialQualityReview = undefined;
  assert.throws(() => applyProductionWorkflowAction(missingQuality, readyRuntime, {
    type: 'approve_delivery', decidedBy: 'local-user', note: '',
  }), /镜头语义与素材质量 Gate/);
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

test('multiple platform targets keep independent approval and schedule state', () => {
  let project = approveDelivery();
  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'approve_publication',
    decidedBy: 'test-user',
    note: '批准当前生产包发布到 B 站并保留独立发布记录。',
    platform: 'B站',
  }, '2026-07-24T02:10:00.000Z');
  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'approve_publication',
    decidedBy: 'test-user',
    note: '批准当前生产包发布到视频号并使用平台化文案。',
    platform: '视频号',
  }, '2026-07-24T02:11:00.000Z');

  assert.deepEqual(
    project.workflow.publicationTargets?.map((target) => [target.id, target.platform, target.status]),
    [['bilibili', 'B站', 'approved'], ['wechat-channels', '视频号', 'approved']],
  );

  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'schedule_publication',
    targetId: 'bilibili',
    scheduledAt: '2026-07-25T11:30:00.000Z',
    submittedAt: '2026-07-24T02:12:00.000Z',
    submissionUrl: 'https://member.bilibili.com/platform/upload/video/frame',
    externalId: 'BV1scheduled',
    note: '平台已通过审核并等待定时发布。',
  }, '2026-07-24T02:12:00.000Z');

  assert.equal(project.workflow.publicationTargets?.[0].status, 'scheduled');
  assert.equal(project.workflow.publicationTargets?.[0].scheduledAt, '2026-07-25T11:30:00.000Z');
  assert.equal(project.workflow.publicationTargets?.[1].status, 'approved');
  assert.equal(project.publication_status, 'ready-for-review');
  assert.match(
    productionWorkflowSnapshot(project, readyRuntime).stages.find((stage) => stage.id === 'publication')?.message ?? '',
    /等待定时发布/,
  );
});

test('publishing one platform preserves another platform schedule', () => {
  let project = approveDelivery();
  for (const platform of ['B站', '视频号']) {
    project = applyProductionWorkflowAction(project, readyRuntime, {
      type: 'approve_publication',
      decidedBy: 'test-user',
      note: `批准当前生产包发布到${platform}并保留独立证据。`,
      platform,
    }, '2026-07-24T02:10:00.000Z');
  }
  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'schedule_publication',
    targetId: 'bilibili',
    scheduledAt: '2026-07-25T11:30:00.000Z',
    externalId: 'BV1scheduled',
  }, '2026-07-24T02:12:00.000Z');
  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'schedule_publication',
    targetId: 'wechat-channels',
    scheduledAt: '2026-07-25T12:00:00.000Z',
    externalId: 'wechat-scheduled',
  }, '2026-07-24T02:12:00.000Z');
  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'record_publication',
    targetId: 'wechat-channels',
    publishedUrl: 'https://channels.weixin.qq.com/example',
    publishedAt: '2026-07-24T03:00:00.000Z',
    externalId: 'wechat-post-01',
  });

  const targets = project.workflow.publicationTargets ?? [];
  assert.equal(targets.find((target) => target.id === 'bilibili')?.status, 'scheduled');
  assert.equal(targets.find((target) => target.id === 'wechat-channels')?.status, 'published');
  assert.equal(targets.find((target) => target.id === 'wechat-channels')?.scheduledAt, '');
  assert.equal(project.publication_status, 'published');
  assert.equal(project.market_status, 'collecting');
});

test('publication scheduling requires a current target approval and a future time', () => {
  const project = approveDelivery();
  assert.throws(() => applyProductionWorkflowAction(project, readyRuntime, {
    type: 'schedule_publication', targetId: 'bilibili', scheduledAt: '2026-07-25T11:30:00.000Z',
  }, '2026-07-24T02:12:00.000Z'), /平台目标尚未获得/);

  const approved = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'approve_publication', decidedBy: 'test-user',
    note: '批准当前生产包发布到 B 站并记录排期。', platform: 'B站',
  }, '2026-07-24T02:10:00.000Z');
  assert.throws(() => applyProductionWorkflowAction(approved, readyRuntime, {
    type: 'schedule_publication', targetId: 'bilibili', scheduledAt: '2026-07-24T01:00:00.000Z',
  }, '2026-07-24T02:12:00.000Z'), /必须晚于当前时间/);
});

test('scheduled and published are not interchangeable publication facts', () => {
  let project = approveDelivery();
  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'approve_publication', decidedBy: 'test-user',
    note: '批准当前生产包发布到 B 站并严格区分排期和发布。', platform: 'B站',
  }, '2026-07-24T02:10:00.000Z');
  assert.throws(() => applyProductionWorkflowAction(project, readyRuntime, {
    type: 'record_publication', targetId: 'bilibili',
    publishedUrl: 'https://www.bilibili.com/video/BV1future/',
    publishedAt: '2026-07-25T11:30:00.000Z',
  }, '2026-07-24T02:12:00.000Z'), /未来排期请记录为 scheduled/);

  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'record_publication', targetId: 'bilibili',
    publishedUrl: 'https://www.bilibili.com/video/BV1published/',
    publishedAt: '2026-07-24T02:11:00.000Z',
  }, '2026-07-24T02:12:00.000Z');
  assert.throws(() => applyProductionWorkflowAction(project, readyRuntime, {
    type: 'schedule_publication', targetId: 'bilibili', scheduledAt: '2026-07-25T11:30:00.000Z',
  }, '2026-07-24T02:12:00.000Z'), /只有已批准或已排期/);
  assert.throws(() => applyProductionWorkflowAction(project, readyRuntime, {
    type: 'reject_publication', targetId: 'bilibili', decidedBy: 'test-user',
    note: '已发布事实不能通过退回审批的方式被覆盖。',
  }, '2026-07-24T02:13:00.000Z'), /已发布的平台目标不能退回/);
});

test('programmatic upload states preserve submitted, scheduled and failure facts', () => {
  let project = applyProductionWorkflowAction(approveDelivery(), readyRuntime, {
    type: 'approve_publication', decidedBy: 'test-user',
    note: '批准当前生产包通过程序发布到视频号。', platform: '视频号',
  }, '2026-07-24T02:10:00.000Z');
  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'start_publication_upload', targetId: 'wechat-channels',
    publisher: 'social-auto-upload', accountName: 'daily-cause', runId: 'run-01',
  }, '2026-07-24T02:11:00.000Z');
  assert.equal(project.workflow.publicationTargets?.[0].status, 'uploading');
  assert.equal(project.workflow.publicationTargets?.[0].accountName, 'daily-cause');
  assert.equal(project.workflow.publicationTargets?.[0].copySnapshot, null);
  assert.deepEqual(project.workflow.publicationTargets?.[0].metricSnapshots, []);

  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'record_publication_submission', targetId: 'wechat-channels', runId: 'run-01',
  }, '2026-07-24T02:12:00.000Z');
  assert.equal(project.workflow.publicationTargets?.[0].status, 'submitted');
  assert.equal(project.publication_status, 'ready-for-review');

  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'start_publication_upload', targetId: 'wechat-channels',
    publisher: 'social-auto-upload', accountName: 'daily-cause', runId: 'run-02',
  }, '2026-07-24T02:13:00.000Z');
  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'record_publication_failure', targetId: 'wechat-channels', runId: 'run-02',
    error: '登录态失效',
  }, '2026-07-24T02:14:00.000Z');
  assert.equal(project.workflow.publicationTargets?.[0].status, 'failed');
  assert.equal(project.workflow.publicationTargets?.[0].lastError, '登录态失效');
  assert.notEqual(project.publication_status, 'published');
});

test('rejecting a primary target also rejects the legacy publication approval', () => {
  let project = approveDelivery();
  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'approve_publication', decidedBy: 'test-user',
    note: '批准当前生产包发布到 B 站并同步主发布摘要。', platform: 'B站',
  }, '2026-07-24T02:10:00.000Z');
  project = applyProductionWorkflowAction(project, readyRuntime, {
    type: 'reject_publication', targetId: 'bilibili', decidedBy: 'test-user',
    note: '平台文案仍需调整，退回当前 B 站发布目标。',
  }, '2026-07-24T02:12:00.000Z');

  assert.equal(project.workflow.publicationTargets?.[0].status, 'rejected');
  assert.equal(project.workflow.publication.approval.status, 'rejected');
  assert.equal(project.publication_status, 'draft-unpublished');
  assert.throws(() => applyProductionWorkflowAction(project, readyRuntime, {
    type: 'reject_publication', targetId: 'missing', decidedBy: 'test-user',
    note: '不存在的发布目标不能静默退回旧摘要。',
  }, '2026-07-24T02:13:00.000Z'), /找不到要退回/);
});

test('normalization migrates legacy publication into the primary target', () => {
  const legacy = approveDelivery();
  legacy.workflow.publication = {
    approval: { status: 'approved', decidedAt: 'now', decidedBy: 'test-user', note: '旧发布记录', fingerprint: 'video-sha:package-sha' },
    platform: 'B站',
    publishedUrl: 'https://www.bilibili.com/video/BV1legacy/',
    publishedAt: '2026-07-24T03:00:00.000Z',
    videoSha256: 'video-sha',
    packageSha256: 'package-sha',
  };
  legacy.workflow.publicationTargets = undefined;
  const normalized = normalizeBrief(legacy);
  assert.deepEqual(
    normalized.workflow.publicationTargets?.map((target) => [target.id, target.platform, target.status]),
    [['primary', 'B站', 'published']],
  );
  const target = normalized.workflow.publicationTargets?.[0];
  assert.ok(target);
  target.copySnapshot = {
    title: '投稿标题', description: '投稿正文', hashtags: ['测试'], generatedByAi: true,
    effectiveTitle: '平台标题', effectiveDescription: '平台正文',
    capturedAt: '2026-07-24T03:00:00.000Z', source: 'platform-copy.json',
  };
  target.metricSnapshots = [{
    observedAt: '2026-07-25T03:00:00.000Z', source: '平台后台',
    viewCount: 0, likeCount: null, commentCount: 0, shareCount: 0, favoriteCount: 0,
    coinCount: null, danmakuCount: null, followerGain: null, completionRate: null,
    averageWatchSeconds: null, twoSecondBounceRate: null, note: '点赞未取得。',
  }];
  const roundTrip = normalizeBrief(normalized).workflow.publicationTargets?.[0];
  assert.equal(roundTrip?.copySnapshot?.effectiveTitle, '平台标题');
  assert.equal(roundTrip?.metricSnapshots[0].viewCount, 0);
  assert.equal(roundTrip?.metricSnapshots[0].likeCount, null);
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
