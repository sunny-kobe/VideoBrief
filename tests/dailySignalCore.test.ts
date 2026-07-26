import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTopicPreflight, rankSignalSources, scoreSignal, signalSlug, type DailySignalSource } from '../src/dailySignalCore';

const now = new Date('2026-07-19T04:00:00.000Z');

function source(overrides: Partial<DailySignalSource> = {}): DailySignalSource {
  return {
    kind: 'github',
    title: 'Example agent workflow release',
    url: 'https://github.com/example/agent-workflow',
    publishedAt: '2026-07-18T12:00:00.000Z',
    summary: 'An open-source coding agent workflow with a browser demo.',
    author: 'example',
    mediaUrls: ['https://example.com/demo.png'],
    ...overrides,
  };
}

test('scores recent first-party actionable signals above generic discussions', () => {
  const strong = scoreSignal(source(), now);
  const weak = scoreSignal(source({
    kind: 'hackernews',
    title: 'A general discussion',
    summary: '',
    publishedAt: '2026-06-01T00:00:00.000Z',
    mediaUrls: [],
  }), now);
  assert.ok(strong.total > weak.total);
  assert.equal(strong.total, 11);
  assert.equal(strong.rightsClarity, 1);
});

test('deduplicates tracking variants and keeps the richer source', () => {
  const candidates = rankSignalSources([
    source({ url: 'https://example.com/post?utm_source=x', summary: 'short' }),
    source({ url: 'https://example.com/post', summary: 'a much richer summary for the same source' }),
  ], { now, limit: 5 });
  assert.equal(candidates.length, 1);
  assert.match(candidates[0].summary, /richer/);
});

test('creates stable ASCII slugs with a hash fallback for Chinese-only titles', () => {
  assert.equal(signalSlug('Agent Workflow 2.0'), 'agent-workflow-2-0');
  assert.match(signalSlug('中文命题'), /^signal-[a-f0-9]{10}$/);
});

test('topic preflight keeps source coverage and material feasibility separate from score', () => {
  const candidate = rankSignalSources([source({
    kind: 'official',
    mediaUrls: ['https://cdn.example.com/demo.mp4'],
  })], { now })[0];
  const preflight = buildTopicPreflight(candidate, ['RSS: fetch failed']);
  assert.equal(preflight.sourceCoverage, 'partial');
  assert.equal(preflight.materialFeasibility, 'promising');
  assert.equal(preflight.recommendation, 'manual_review');
  assert.match(preflight.risks.join('；'), /交叉核验|来源缺口/);
});
