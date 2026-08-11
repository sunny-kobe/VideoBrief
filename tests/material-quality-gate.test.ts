import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMaterialQualityReview,
  materialQualityGateReadiness,
  materialQualitySceneFingerprint,
} from '../scripts/lib/material-quality-gate.mjs';
import type { ShortVideoProject } from '../src/shortVideoBrief';

function project() {
  return {
    id: 'material-quality-project',
    render: { width: 1920, height: 1080, fps: 30, mediaFit: 'contain' },
    renditions: [{ id: 'landscape', width: 1920, height: 1080, aspectRatio: '16:9' }],
    scenes: [{
      id: 'scene-01',
      enabled: true,
      title: 'Agent 循环',
      subtitle: '思考、行动、观察',
      narration: 'Agent 会调用工具，并把结果放回上下文。',
      visualRequirement: '必须完整显示 THINK、ACT、OBSERVE。',
      sourceReferences: [],
      selectedCandidateId: 'candidate-01',
      sourceId: 'source-01',
      sourceStart: 0,
      sourceEnd: 12,
      mediaMotion: 'none',
      candidates: [{
        id: 'candidate-01', sourceId: 'source-01', assetPath: 'source.mp4', mediaType: 'video',
        sourceStart: 0, sourceEnd: 12,
      }],
    }],
  } as unknown as ShortVideoProject;
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 'material-quality-project',
    reviewScope: '桌面和移动视口，start/mid/end。',
    reviews: [{
      sceneId: 'scene-01',
      candidate: { sourceId: 'source-01', sourceStart: 0, sourceEnd: 12 },
      visibleClaim: '轨迹依次出现 THINK、ACT、OBSERVE。',
      evidenceRole: 'operation-demo',
      narrationMatch: { score: 3, reason: '直接支持旁白。' },
      readability: {
        desktop: 'passed', mobile: 'passed', criticalText: ['THINK', 'ACT', 'OBSERVE'], reason: '可读。',
      },
      temporalCompleteness: { status: 'passed', reason: '完整覆盖。' },
      stability: { status: 'stable', motionNecessary: true, reason: '状态变化属于内容。' },
      uniqueness: { status: 'unique', reason: '只承担本观点。' },
      platformWatermark: { status: 'absent', marks: [], reason: 'start/mid/end 均无平台或账号水印。' },
      decision: 'accept',
      decisionReasons: ['通过'],
      evidence: ['scene-01-start.png', 'scene-01-mid.png', 'scene-01-end.png'],
      ...overrides,
    }],
  };
}

test('keeps historical projects without the versioned material-quality gate compatible', () => {
  assert.deepEqual(materialQualityGateReadiness(project()), {
    ready: true, required: false, issues: [], reviewedSceneCount: 0,
  });
});

test('blocks a formal workflow project without the versioned material-quality gate', () => {
  const value = project();
  value.workflow = {} as ShortVideoProject['workflow'];
  assert.deepEqual(materialQualityGateReadiness(value), {
    ready: false,
    required: true,
    issues: ['正式项目缺少当前版本的素材质量 Gate。'],
    reviewedSceneCount: 0,
  });
});

test('accepts a current per-scene review bound to the selected candidate and render target', () => {
  const value = project();
  value.materialQualityReview = buildMaterialQualityReview(value, report(), 'codex');
  assert.deepEqual(materialQualityGateReadiness(value), {
    ready: true, required: true, issues: [], reviewedSceneCount: 1,
  });
});

test('blocks information-bearing footage that is unreadable on mobile', () => {
  const value = project();
  value.materialQualityReview = buildMaterialQualityReview(value, report({
    readability: {
      desktop: 'passed', mobile: 'failed', criticalText: ['THINK', 'ACT', 'OBSERVE'], reason: '移动端字太小。',
    },
    decision: 'accept',
  }), 'codex');
  value.materialQualityReview.status = 'passed';
  const readiness = materialQualityGateReadiness(value);
  assert.equal(readiness.ready, false);
  assert.match(readiness.issues.join('\n'), /移动视口不可直接读取/);
});

test('invalidates a review when narration or visual binding changes', () => {
  const value = project();
  value.materialQualityReview = buildMaterialQualityReview(value, report(), 'codex');
  value.scenes[0].narration = '修改后的旁白。';
  const readiness = materialQualityGateReadiness(value);
  assert.equal(readiness.ready, false);
  assert.match(readiness.issues.join('\n'), /必须重新复核/);
});

test('invalidates a review when the selected source window drifts', () => {
  const value = project();
  value.materialQualityReview = buildMaterialQualityReview(value, report(), 'codex');
  value.scenes[0].sourceEnd = 11;
  const readiness = materialQualityGateReadiness(value);
  assert.equal(readiness.ready, false);
  assert.match(readiness.issues.join('\n'), /sourceId\/sourceStart\/sourceEnd/);
});

test('blocks unnecessary motion on an otherwise static information scene', () => {
  const value = project();
  value.materialQualityReview = buildMaterialQualityReview(value, report({
    stability: { status: 'minor-motion', motionNecessary: false, reason: 'push-in 不增加信息。' },
    decision: 'accept',
  }), 'codex');
  value.materialQualityReview.status = 'passed';
  const readiness = materialQualityGateReadiness(value);
  assert.equal(readiness.ready, false);
  assert.match(readiness.issues.join('\n'), /不必要或影响阅读/);
});

test('blocks a scene when platform or account watermarks are visible', () => {
  const value = project();
  value.materialQualityReview = buildMaterialQualityReview(value, report({
    platformWatermark: {
      status: 'present', marks: ['bilibili', '来源账号角标'], reason: '右上角持续可见。',
    },
    decision: 'accept',
  }), 'codex');
  value.materialQualityReview.status = 'passed';
  const readiness = materialQualityGateReadiness(value);
  assert.equal(readiness.ready, false);
  assert.match(readiness.issues.join('\n'), /不允许进入正式成片的平台或账号水印/);
});

test('blocks a scene whose platform watermark review is missing', () => {
  const value = project();
  const missingWatermarkReport = report();
  delete (missingWatermarkReport.reviews[0] as { platformWatermark?: unknown }).platformWatermark;
  value.materialQualityReview = buildMaterialQualityReview(value, missingWatermarkReport, 'codex');
  value.materialQualityReview.status = 'passed';
  const readiness = materialQualityGateReadiness(value);
  assert.equal(readiness.ready, false);
  assert.match(readiness.issues.join('\n'), /尚未完成平台水印复核/);
});

test('scene fingerprint includes output dimensions and editorial motion', () => {
  const value = project();
  const before = materialQualitySceneFingerprint(value, value.scenes[0]);
  value.render.width = 1080;
  value.render.height = 1920;
  assert.notEqual(materialQualitySceneFingerprint(value, value.scenes[0]), before);
});
