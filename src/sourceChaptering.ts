import { createHash } from 'node:crypto';

import type { FrameSampleReason, PlannedFrameSample } from './videoFrameSampling';

export const LONG_SOURCE_THRESHOLD_SECONDS = 180;
export const TARGET_CHAPTER_SECONDS = 150;
export const MIN_CHAPTER_SECONDS = 75;
export const MAX_CHAPTER_SECONDS = 180;
export const MIN_CHAPTER_FRAME_SAMPLES = 4;
export const MAX_CHAPTER_FRAME_SAMPLES = 16;
export const HIGH_CONFIDENCE_SCENE_THRESHOLD = 0.28;
export const STRUCTURAL_SCENE_THRESHOLD = 0.02;
export const MIN_SCENE_CHANGE_SPACING_SECONDS = 0.75;

export interface SourceChapterPlan {
  id: string;
  index: number;
  start: number;
  end: number;
}

export interface SourceChapterResumeInput {
  sourceHash: string;
  model: string;
  promptVersion: string;
  brief: unknown;
  plan: Pick<SourceChapterPlan, 'start' | 'end'>;
  transcriptText: string;
  frameSeconds: number[];
}

export function sourceChapterResumeKey(input: SourceChapterResumeInput) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export function canReuseCompletedSourceChapter(
  chapter: {
    start: number;
    end: number;
    processing: { status: string; resumeKey?: string };
  } | undefined,
  plan: Pick<SourceChapterPlan, 'start' | 'end'>,
  resumeKey: string,
) {
  return chapter?.processing.status === 'completed'
    && chapter.processing.resumeKey === resumeKey
    && chapter.start === plan.start
    && chapter.end === plan.end;
}

function finiteSeconds(values: number[], duration: number) {
  return [...new Set(values
    .filter((value) => Number.isFinite(value) && value > 0 && value < duration)
    .map((value) => Number(value.toFixed(3))))]
    .sort((left, right) => left - right);
}

export function needsStructuralSceneFallback(duration: number, sceneChangeCount: number) {
  const normalizedDuration = Math.max(0, Number(duration) || 0);
  const normalizedCount = Math.max(0, Math.floor(Number(sceneChangeCount) || 0));
  if (normalizedDuration <= 0) return false;
  return normalizedCount < Math.max(1, Math.floor(normalizedDuration / 120));
}

export function normalizeDetectedSceneChanges(
  values: number[],
  duration: number,
  options: { minimumSpacingSeconds?: number; maximumCount?: number } = {},
) {
  const normalizedDuration = Math.max(0, Number(duration) || 0);
  if (normalizedDuration <= 0) return [];
  const minimumSpacing = Math.max(
    0.1,
    Number(options.minimumSpacingSeconds) || MIN_SCENE_CHANGE_SPACING_SECONDS,
  );
  const maximumCount = Math.max(
    1,
    Math.floor(Number(options.maximumCount) || Math.max(12, Math.ceil(normalizedDuration))),
  );
  const spaced = finiteSeconds(values, normalizedDuration).filter((second, index, all) => (
    index === 0 || second - all[index - 1] >= minimumSpacing
  ));
  if (spaced.length <= maximumCount) return spaced;
  if (maximumCount === 1) return [spaced[Math.floor(spaced.length / 2)]];
  return Array.from({ length: maximumCount }, (_, index) => (
    spaced[Math.round(index * (spaced.length - 1) / (maximumCount - 1))]
  ));
}

export function planSourceChapters(
  duration: number,
  sceneChanges: number[] = [],
  transcriptBoundaries: number[] = [],
): SourceChapterPlan[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [{ id: 'chapter-01', index: 0, start: 0, end: 0 }];
  }
  if (duration <= LONG_SOURCE_THRESHOLD_SECONDS) {
    return [{ id: 'chapter-01', index: 0, start: 0, end: Number(duration.toFixed(3)) }];
  }

  const sceneCandidates = finiteSeconds(sceneChanges, duration);
  const transcriptCandidates = finiteSeconds(transcriptBoundaries, duration);
  const boundaries = [0];
  let start = 0;

  while (duration - start > MAX_CHAPTER_SECONDS) {
    const target = start + TARGET_CHAPTER_SECONDS;
    const minimum = start + MIN_CHAPTER_SECONDS;
    const maximum = Math.min(start + MAX_CHAPTER_SECONDS, duration - MIN_CHAPTER_SECONDS);
    const candidates = [
      ...sceneCandidates.map((second) => ({ second, priority: 0 })),
      ...transcriptCandidates.map((second) => ({ second, priority: 1 })),
    ].filter(({ second }) => second >= minimum && second <= maximum);
    const selected = candidates.sort((left, right) => {
      const leftScore = Math.abs(left.second - target) + left.priority * 8;
      const rightScore = Math.abs(right.second - target) + right.priority * 8;
      return Math.abs(leftScore - rightScore) > 0.001
        ? leftScore - rightScore
        : left.priority - right.priority;
    })[0]?.second ?? Math.min(target, maximum);
    const boundary = Number(selected.toFixed(3));
    if (boundary <= start) break;
    boundaries.push(boundary);
    start = boundary;
  }
  boundaries.push(Number(duration.toFixed(3)));

  return boundaries.slice(0, -1).map((chapterStart, index) => ({
    id: `chapter-${String(index + 1).padStart(2, '0')}`,
    index,
    start: chapterStart,
    end: boundaries[index + 1],
  }));
}

function coverageSample(chapter: SourceChapterPlan, ratio: number): PlannedFrameSample {
  const second = chapter.start + (chapter.end - chapter.start) * ratio;
  return { second, ratio, reason: 'coverage' };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function targetChapterFrameSampleCount(duration: number, sceneChangeCount: number) {
  const normalizedDuration = Math.max(0, Number(duration) || 0);
  const normalizedChanges = Math.max(0, Math.floor(Number(sceneChangeCount) || 0));
  if (normalizedDuration <= 0.1) return 1;
  const coverageCount = clamp(
    Math.ceil(normalizedDuration / 25) + 2,
    MIN_CHAPTER_FRAME_SAMPLES,
    10,
  );
  const changeBonus = Math.min(6, Math.ceil(normalizedChanges / 4));
  return Math.min(MAX_CHAPTER_FRAME_SAMPLES, coverageCount + changeBonus);
}

function distributedCoverageRatios(count: number) {
  if (count <= 1) return [0.5];
  return Array.from({ length: count }, (_, index) => (
    Number((0.05 + (0.9 * index / (count - 1))).toFixed(6))
  ));
}

function selectDistributedSceneChanges(
  candidates: number[],
  coverageSeconds: number[],
  budget: number,
) {
  const selected: number[] = [];
  const remaining = [...candidates];
  while (selected.length < budget && remaining.length) {
    const anchors = [...coverageSeconds, ...selected];
    remaining.sort((left, right) => {
      const leftDistance = Math.min(...anchors.map((anchor) => Math.abs(left - anchor)));
      const rightDistance = Math.min(...anchors.map((anchor) => Math.abs(right - anchor)));
      return Math.abs(leftDistance - rightDistance) > 0.001
        ? rightDistance - leftDistance
        : left - right;
    });
    selected.push(remaining.shift()!);
  }
  return selected;
}

export function planChapterFrameSamples(
  chapter: SourceChapterPlan,
  sceneChanges: number[] = [],
): PlannedFrameSample[] {
  const duration = Math.max(0, chapter.end - chapter.start);
  if (duration <= 0.1) return [{ second: chapter.start, ratio: 0, reason: 'coverage' }];
  const localSceneChanges = finiteSeconds(sceneChanges, chapter.end)
    .filter((second) => second > chapter.start && second < chapter.end);
  const targetCount = targetChapterFrameSampleCount(duration, localSceneChanges.length);
  const coverageCount = Math.min(
    targetCount,
    clamp(Math.ceil(duration / 25) + 2, MIN_CHAPTER_FRAME_SAMPLES, 10),
  );
  const samples: PlannedFrameSample[] = distributedCoverageRatios(coverageCount)
    .map((ratio) => coverageSample(chapter, ratio));
  const localChanges = selectDistributedSceneChanges(
    localSceneChanges,
    samples.map((sample) => sample.second),
    targetCount - coverageCount,
  )
    .map((second) => ({
      second,
      ratio: (second - chapter.start) / duration,
      reason: 'scene-change' as FrameSampleReason,
    }));

  return [...samples, ...localChanges]
    .sort((left, right) => left.second - right.second)
    .filter((sample, index, all) => index === 0 || sample.second - all[index - 1].second >= 0.25)
    .map((sample) => ({ ...sample, second: Number(sample.second.toFixed(3)) }));
}
