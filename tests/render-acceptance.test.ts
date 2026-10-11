import assert from 'node:assert/strict';
import test from 'node:test';

import { canPreviewRenderForReview, renderAcceptanceState } from '../src/renderAcceptance';
import type { RenderAcceptance } from '../src/shortVideoBrief';

test('explicit review playback admits current technical drafts without approving them', () => {
  assert.equal(canPreviewRenderForReview('awaiting_semantic', true), true);
  assert.equal(canPreviewRenderForReview('review_failed', true), true);
  assert.equal(canPreviewRenderForReview('awaiting_browser', true), true);
  assert.equal(canPreviewRenderForReview('awaiting_semantic', false), false);
  assert.equal(renderAcceptanceState(undefined, 'current-video'), 'awaiting_semantic');
});

test('review playback cannot expose stale, missing or technically unverified renders', () => {
  for (const state of ['stale', 'missing', 'unverified'] as const) {
    assert.equal(canPreviewRenderForReview(state, true), false);
  }
});

function acceptance(overrides: Partial<RenderAcceptance> = {}): RenderAcceptance {
  return {
    videoSha256: 'current-video',
    semantic: {
      status: 'passed',
      checkedAt: 'now',
      reviewer: 'codex',
      activeSeconds: 30,
      minimumActiveSeconds: 30,
      activeSecondsSource: 'review-session',
      reviewSessionId: 'session-01',
      editorialQuality: {
        schemaVersion: 1,
        profile: 'evidence-explainer',
        status: 'passed',
        sourcePath: '/tmp/quality.json',
        checks: {},
        signals: {
          sceneCount: 1,
          freezeIntervalCount: 0,
          freezeCoverageSeconds: 0,
          freezeCoverageRatio: 0,
          narrationSimilarity: 1,
          unmatchedPronunciationTerms: [],
        },
      },
      issues: [],
      scenes: [],
    },
    browser: {
      status: 'passed',
      checkedAt: 'now',
      url: 'http://127.0.0.1:3100/short-video',
      browser: 'Google Chrome',
      viewport: { width: 1440, height: 900 },
      readyState: 4,
      duration: 10,
      playedSeconds: 1,
      ended: true,
      consoleErrors: [],
      mediaError: '',
      screenshot: '/tmp/screenshot.png',
      checks: [
        {
          name: 'desktop', viewport: { width: 1440, height: 900 }, readyState: 4,
          duration: 10, playedSeconds: 10, ended: true, fullPlayback: true, playbackRate: 1,
          muted: false, volume: 0.05, consoleErrors: [], mediaError: '', screenshot: '/tmp/desktop.png',
        },
        {
          name: 'mobile', viewport: { width: 390, height: 844 }, readyState: 4,
          duration: 10, playedSeconds: 10, ended: true, fullPlayback: true, playbackRate: 1,
          muted: false, volume: 0.05, consoleErrors: [], mediaError: '', screenshot: '/tmp/mobile.png',
        },
      ],
      issues: [],
    },
    ...overrides,
  };
}

test('technical proof without semantic acceptance is not ready', () => {
  assert.equal(renderAcceptanceState(undefined, 'current-video'), 'awaiting_semantic');
});

test('acceptance bound to different video bytes is invalidated', () => {
  assert.equal(renderAcceptanceState(acceptance(), 'changed-video'), 'awaiting_semantic');
});

test('semantic acceptance does not skip browser acceptance', () => {
  const value = acceptance();
  value.browser.status = 'pending';
  assert.equal(renderAcceptanceState(value, 'current-video'), 'awaiting_browser');
});

test('legacy semantic acceptance without editorial quality returns to review', () => {
  const value = acceptance();
  delete value.semantic.editorialQuality;
  assert.equal(renderAcceptanceState(value, 'current-video'), 'awaiting_semantic');
});

test('legacy caller-reported review duration returns to review', () => {
  const value = acceptance();
  value.semantic.activeSecondsSource = 'legacy-manual';
  assert.equal(renderAcceptanceState(value, 'current-video'), 'awaiting_semantic');
});

test('browser acceptance without full 1x desktop and mobile playback is incomplete', () => {
  const value = acceptance();
  value.browser.checks![1].playedSeconds = 1;
  value.browser.checks![1].ended = false;
  assert.equal(renderAcceptanceState(value, 'current-video'), 'awaiting_browser');
});

test('only matching semantic and browser acceptance is ready', () => {
  assert.equal(renderAcceptanceState(acceptance(), 'current-video'), 'ready');
});
