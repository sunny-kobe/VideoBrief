export type FrameSampleReason = 'coverage' | 'scene-change';

export interface PlannedFrameSample {
  second: number;
  ratio: number;
  reason: FrameSampleReason;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function targetRepresentativeFrameCount(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0.2) return 1;
  return clamp(Math.ceil(duration / 30) + 3, 3, 12);
}

export function planRepresentativeFrameSamples(
  duration: number,
  sceneChanges: number[] = [],
): PlannedFrameSample[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [{ second: 0, ratio: 0, reason: 'coverage' }];
  }
  if (duration <= 0.2) {
    return [{ second: Math.max(0, duration / 2), ratio: 0.5, reason: 'coverage' }];
  }

  const targetCount = targetRepresentativeFrameCount(duration);
  const minimumSecond = Math.min(0.05, duration / 4);
  const maximumSecond = Math.max(minimumSecond, duration - 0.05);
  const minimumGap = Math.max(0.12, duration / (targetCount * 12));
  const selected: PlannedFrameSample[] = [];

  function add(second: number, reason: FrameSampleReason) {
    const normalized = clamp(second, minimumSecond, maximumSecond);
    if (selected.some((sample) => Math.abs(sample.second - normalized) < minimumGap)) return false;
    selected.push({ second: normalized, ratio: normalized / duration, reason });
    return true;
  }

  [0.05, 0.5, 0.95].slice(0, targetCount).forEach((ratio) => add(duration * ratio, 'coverage'));

  const candidates = [...new Set(sceneChanges
    .map(Number)
    .filter((second) => Number.isFinite(second) && second > 0 && second < duration)
    .map((second) => clamp(second + 0.12, minimumSecond, maximumSecond)))]
    .sort((left, right) => left - right);
  const sceneChangeBudget = Math.max(0, Math.ceil(targetCount / 2));
  let selectedSceneChanges = 0;
  while (selected.length < targetCount && candidates.length && selectedSceneChanges < sceneChangeBudget) {
    let bestIndex = 0;
    let bestDistance = -1;
    candidates.forEach((candidate, index) => {
      const distance = Math.min(...selected.map((sample) => Math.abs(sample.second - candidate)));
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    const [candidate] = candidates.splice(bestIndex, 1);
    if (add(candidate, 'scene-change')) selectedSceneChanges += 1;
  }

  while (selected.length < targetCount) {
    const boundaries = [minimumSecond, ...selected.map((sample) => sample.second), maximumSecond]
      .sort((left, right) => left - right);
    let bestStart = boundaries[0];
    let bestEnd = boundaries[1];
    for (let index = 1; index < boundaries.length - 1; index += 1) {
      if (boundaries[index + 1] - boundaries[index] > bestEnd - bestStart) {
        bestStart = boundaries[index];
        bestEnd = boundaries[index + 1];
      }
    }
    if (!add((bestStart + bestEnd) / 2, 'coverage')) break;
  }

  return selected.sort((left, right) => left.second - right.second);
}
