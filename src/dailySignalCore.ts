import { createHash } from 'node:crypto';

export type DailySignalKind = 'official' | 'github' | 'hackernews' | 'rss' | 'manual';
export type DailySignalStatus = 'candidate' | 'approved' | 'rejected';

export interface DailySignalSource {
  kind: DailySignalKind;
  title: string;
  url: string;
  publishedAt: string;
  summary: string;
  author: string;
  mediaUrls: string[];
}

export interface DailySignalScore {
  firstParty: number;
  recency: number;
  actionability: number;
  verifiability: number;
  mediaRichness: number;
  rightsClarity: number;
  total: number;
}

export interface DailySignalCandidate {
  id: string;
  title: string;
  summary: string;
  primaryUrl: string;
  publishedAt: string;
  tags: string[];
  sources: DailySignalSource[];
  score: DailySignalScore;
  status: DailySignalStatus;
  projectId: string;
}

export interface DailySignalRun {
  schemaVersion: 1;
  id: string;
  date: string;
  createdAt: string;
  completedAt: string;
  status: 'running' | 'completed' | 'failed';
  zeroCost: true;
  errors: string[];
  candidates: DailySignalCandidate[];
}

const actionPattern = /\b(agent|agents|ai|llm|model|mcp|codex|claude|workflow|developer|coding|open.?source|release|tool|automation|video)\b/i;
const mediaPattern = /\b(demo|video|launch|showcase|tutorial|visual|image|design|game|browser|app)\b/i;

function clampScore(value: number) {
  return Math.max(0, Math.min(2, Math.round(value)));
}

export function signalSlug(value: string) {
  const ascii = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return ascii || `signal-${createHash('sha256').update(value).digest('hex').slice(0, 10)}`;
}

export function candidateId(source: Pick<DailySignalSource, 'title' | 'url'>) {
  return `${signalSlug(source.title).slice(0, 36)}-${createHash('sha256').update(source.url).digest('hex').slice(0, 8)}`;
}

function ageInHours(publishedAt: string, now: Date) {
  const timestamp = Date.parse(publishedAt);
  return Number.isFinite(timestamp) ? Math.max(0, (now.getTime() - timestamp) / 3_600_000) : Number.POSITIVE_INFINITY;
}

export function scoreSignal(source: DailySignalSource, now = new Date()): DailySignalScore {
  const text = `${source.title} ${source.summary}`;
  const ageHours = ageInHours(source.publishedAt, now);
  const firstParty = source.kind === 'official' || source.kind === 'github' ? 2 : source.kind === 'rss' ? 1 : 0;
  const recency = ageHours <= 48 ? 2 : ageHours <= 24 * 7 ? 1 : 0;
  const actionability = actionPattern.test(text) ? 2 : source.kind === 'github' ? 1 : 0;
  const verifiability = source.url.startsWith('https://') ? (source.kind === 'github' || source.kind === 'official' ? 2 : 1) : 0;
  const mediaRichness = source.mediaUrls.length > 0 ? 2 : mediaPattern.test(text) ? 1 : 0;
  const rightsClarity = source.kind === 'github' || source.kind === 'official' ? 1 : 0;
  const parts = { firstParty, recency, actionability, verifiability, mediaRichness, rightsClarity };
  return {
    ...parts,
    total: Object.values(parts).reduce((sum, value) => sum + clampScore(value), 0),
  };
}

function normalizedUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'ref' || key === 'source') url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.trim();
  }
}

function candidateTags(source: DailySignalSource) {
  const text = `${source.title} ${source.summary}`.toLowerCase();
  return ['agent', 'mcp', 'codex', 'claude', 'github', 'video', 'workflow', 'model', 'open-source']
    .filter((tag) => text.includes(tag));
}

export function rankSignalSources(
  sources: DailySignalSource[],
  options: { now?: Date; limit?: number } = {},
) {
  const now = options.now ?? new Date();
  const merged = new Map<string, DailySignalSource>();
  for (const source of sources) {
    if (!source.title.trim() || !source.url.trim()) continue;
    const key = normalizedUrl(source.url);
    const existing = merged.get(key);
    if (!existing || source.summary.length > existing.summary.length) merged.set(key, source);
  }
  return [...merged.values()]
    .map<DailySignalCandidate>((source) => ({
      id: candidateId(source),
      title: source.title.trim(),
      summary: source.summary.trim(),
      primaryUrl: normalizedUrl(source.url),
      publishedAt: source.publishedAt,
      tags: candidateTags(source),
      sources: [source],
      score: scoreSignal(source, now),
      status: 'candidate',
      projectId: '',
    }))
    .sort((left, right) => right.score.total - left.score.total || right.publishedAt.localeCompare(left.publishedAt))
    .slice(0, options.limit ?? 5);
}

