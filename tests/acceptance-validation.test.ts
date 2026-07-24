import assert from 'node:assert/strict';
import test from 'node:test';

import {
  intervalCoverage,
  validateBrowserChecks,
  validateEditorialQualityReview,
  validateReviewSession,
  validateSceneReviewNotes,
  validateSemanticAcceptanceRecord,
  validateSemanticReviewRequest,
} from '../scripts/lib/acceptance-validation.mjs';

function qualityReview() {
  return {
    profile: 'evidence-explainer',
    checks: Object.fromEntries([
      'opening',
      'visualReadability',
      'pacing',
      'subtitleReadability',
      'pronunciation',
      'platformFit',
      'cta',
    ].map((id) => [id, { status: 'passed', note: `${id} 已按目标平台逐项核对并确认通过。` }])),
  };
}

test('semantic approval requires a concrete review note', () => {
  const result = validateSemanticReviewRequest({
    decision: 'passed',
    reviewer: 'codex',
    note: '',
    activeSeconds: 30,
    activeSecondsSource: 'review-session',
  });
  assert.equal(result.valid, false);
  assert.match(result.issues.join(' '), /concrete semantic review note/);
});

test('semantic approval requires explicit freeze acknowledgement', () => {
  const result = validateSemanticReviewRequest({
    decision: 'passed',
    reviewer: 'codex',
    note: '逐场景检查了画面、旁白、字幕和来源窗口。',
    freezeIntervalCount: 2,
    activeSeconds: 30,
    activeSecondsSource: 'review-session',
  });
  assert.equal(result.valid, false);
  assert.match(result.issues.join(' '), /confirm-freezes/);
});

test('completed semantic review requires measured active review time', () => {
  const result = validateSemanticReviewRequest({
    decision: 'passed',
    reviewer: 'codex',
    note: '逐场景检查了画面、旁白、字幕和来源窗口。',
    activeSeconds: 0,
    activeSecondsSource: 'review-session',
  });
  assert.equal(result.valid, false);
  assert.match(result.issues.join(' '), /system-measured review duration/);
});

test('semantic approval enforces minimum active time per rendered scene', () => {
  const result = validateSemanticReviewRequest({
    decision: 'passed',
    reviewer: 'codex',
    note: '逐场景检查了画面、旁白、字幕和来源窗口。',
    sceneCount: 7,
    activeSeconds: 36,
    activeSecondsSource: 'review-session',
  });
  assert.equal(result.valid, false);
  assert.equal(result.minimumActiveSeconds, 56);
  assert.match(result.issues.join(' '), /below the 56s minimum/);
});

test('long-form semantic review time follows the changed chapter duration', () => {
  const full = validateSemanticReviewRequest({
    decision: 'passed',
    reviewer: 'codex',
    note: '完整长视频已经逐章核对画面、旁白、字幕和来源窗口。',
    sceneCount: 40,
    videoDurationSeconds: 600,
    reviewDurationSeconds: 600,
    activeSeconds: 449,
    activeSecondsSource: 'review-session',
  });
  assert.equal(full.minimumActiveSeconds, 450);
  assert.equal(full.valid, false);
  const oneChangedChapter = validateSemanticReviewRequest({
    decision: 'passed',
    reviewer: 'codex',
    note: '已重新核对修改章节并确认与上下文衔接正确。',
    sceneCount: 8,
    videoDurationSeconds: 600,
    reviewDurationSeconds: 120,
    activeSeconds: 90,
    activeSecondsSource: 'review-session',
  });
  assert.equal(oneChangedChapter.minimumActiveSeconds, 90);
  assert.equal(oneChangedChapter.valid, true);
});

test('semantic approval requires explicit pronunciation warning acknowledgement', () => {
  const result = validateSemanticReviewRequest({
    decision: 'passed',
    reviewer: 'codex',
    note: '逐场景检查了画面、旁白、字幕和来源窗口。',
    pronunciationWarningCount: 1,
    activeSeconds: 30,
    activeSecondsSource: 'review-session',
  });
  assert.equal(result.valid, false);
  assert.match(result.issues.join(' '), /confirm-pronunciations/);
});

test('semantic approval rejects caller-reported time without a review session', () => {
  const result = validateSemanticReviewRequest({
    decision: 'passed',
    reviewer: 'codex',
    note: '逐场景检查了画面、旁白、字幕和来源窗口。',
    activeSeconds: 90,
    activeSecondsSource: 'legacy-manual',
  });
  assert.equal(result.valid, false);
  assert.match(result.issues.join(' '), /system-measured review session/);
});

test('review session measures elapsed time and binds it to project and video bytes', () => {
  const result = validateReviewSession({
    session: {
      status: 'active',
      sessionId: 'session-01',
      projectId: 'project-01',
      projectFingerprint: 'project-sha',
      videoSha256: 'video-sha',
      startedAt: '2026-07-22T00:00:00.000Z',
    },
    projectId: 'project-01',
    projectFingerprint: 'project-sha',
    videoSha256: 'video-sha',
    now: '2026-07-22T00:01:30.900Z',
  });
  assert.deepEqual(result, { valid: true, activeSeconds: 90, issues: [] });
  assert.equal(validateReviewSession({
    session: { ...result, status: 'active', sessionId: 'session-01' },
    projectId: 'project-01',
    projectFingerprint: 'project-sha',
    videoSha256: 'video-sha',
  }).valid, false);
});

test('ready semantic acceptance requires a measured review-session record', () => {
  const semantic = {
    status: 'passed',
    activeSeconds: 60,
    minimumActiveSeconds: 30,
    activeSecondsSource: 'review-session',
    reviewSessionId: 'session-01',
    editorialQuality: { status: 'passed' },
  };
  assert.equal(validateSemanticAcceptanceRecord(semantic).passed, true);
  assert.equal(validateSemanticAcceptanceRecord({ ...semantic, activeSecondsSource: 'legacy-manual' }).passed, false);
});

test('semantic approval requires every structured editorial quality check', () => {
  const complete = validateEditorialQualityReview({ decision: 'passed', review: qualityReview() });
  assert.equal(complete.valid, true);
  const incomplete = qualityReview();
  delete incomplete.checks.pacing;
  const result = validateEditorialQualityReview({ decision: 'passed', review: incomplete });
  assert.equal(result.valid, false);
  assert.match(result.issues.join(' '), /pacing/);
});

test('freeze coverage merges overlapping intervals and reports a ratio', () => {
  assert.deepEqual(intervalCoverage([
    { start: 0, end: 3 },
    { start: 2, end: 5 },
    { start: 8, end: 12 },
  ], 10), { seconds: 7, ratio: 0.7 });
});

test('semantic approval requires a concrete note for every scene', () => {
  const result = validateSceneReviewNotes({
    decision: 'passed',
    sceneIds: ['scene-01', 'scene-02'],
    sceneNotes: {
      'scene-01': 'README 问题定义与当前旁白一致。',
      'scene-02': '太短',
    },
  });
  assert.equal(result.valid, false);
  assert.match(result.issues.join('\n'), /Scene scene-02 requires a concrete review note/);
});

test('semantic approval rejects notes for scenes outside the current render', () => {
  const result = validateSceneReviewNotes({
    decision: 'passed',
    sceneIds: ['scene-01'],
    sceneNotes: {
      'scene-01': 'README 问题定义与当前旁白一致。',
      'scene-99': '不应被静默保留的旧场景说明。',
    },
  });
  assert.equal(result.valid, false);
  assert.match(result.issues.join('\n'), /unknown scene id/);
});

test('reused scenes remain allowed but do not require duplicate review notes', () => {
  const result = validateSceneReviewNotes({
    decision: 'passed',
    sceneIds: ['scene-01', 'scene-02'],
    requiredSceneIds: ['scene-02'],
    sceneNotes: {
      'scene-02': '第二章修改后的画面、旁白和来源窗口已经重新核对。',
    },
  });
  assert.equal(result.valid, true);
  assert.equal(result.notes['scene-01'], '');
});

test('browser acceptance requires desktop and mobile complete audible playback at 1x', () => {
  const checks = [
    {
      name: 'desktop',
      viewport: { width: 1440, height: 900 },
      readyState: 4,
      duration: 10,
      playedSeconds: 10,
      ended: true,
      fullPlayback: true,
      playbackRate: 1,
      muted: false,
      volume: 0.05,
      consoleErrors: [],
      mediaError: '',
    },
    {
      name: 'mobile',
      viewport: { width: 390, height: 844 },
      readyState: 4,
      duration: 10,
      playedSeconds: 10,
      ended: true,
      fullPlayback: true,
      playbackRate: 1,
      muted: false,
      volume: 0.05,
      consoleErrors: [],
      mediaError: '',
    },
  ];
  assert.deepEqual(validateBrowserChecks(checks, 10), { passed: true, issues: [] });
  assert.equal(validateBrowserChecks(checks.slice(0, 1), 10).passed, false);
  assert.equal(validateBrowserChecks(checks.map((check) => ({ ...check, muted: true })), 10).passed, false);
  assert.equal(validateBrowserChecks(checks.map((check) => ({ ...check, playbackRate: 4 })), 10).passed, false);
});
