export const DEFAULT_BOUNDARY_SILENCE_SECONDS = 0.45;
const DEFAULT_EDGE_TOLERANCE_SECONDS = 0.05;
const DEFAULT_PROTECTION_SECONDS = 0.015;

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`);
  return number;
}

export function parseSilenceIntervals(output) {
  const starts = [...String(output).matchAll(/silence_start:\s*([\d.]+)/g)]
    .map((match) => Number(match[1]));
  const ends = [...String(output).matchAll(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)]
    .map((match) => ({ end: Number(match[1]), duration: Number(match[2]) }));

  if (starts.length !== ends.length) {
    throw new Error(`Silence detection returned ${starts.length} start(s) and ${ends.length} end(s).`);
  }

  return starts.map((start, index) => ({
    start,
    end: ends[index].end,
    duration: ends[index].duration,
  }));
}

export function resolveAudibleVoiceWindow({
  silences,
  audioDuration,
  edgeTolerance = DEFAULT_EDGE_TOLERANCE_SECONDS,
  protection = 0.04,
}) {
  const duration = finiteNumber(audioDuration, 'audioDuration');
  if (duration <= 0) throw new Error('audioDuration must be greater than zero.');
  const tolerance = Math.max(0, finiteNumber(edgeTolerance, 'edgeTolerance'));
  const padding = Math.max(0, finiteNumber(protection, 'protection'));
  const normalized = (Array.isArray(silences) ? silences : [])
    .map((silence, index) => ({
      start: finiteNumber(silence?.start, `silences[${index}].start`),
      end: finiteNumber(silence?.end, `silences[${index}].end`),
    }))
    .filter((silence) => silence.start >= 0 && silence.end > silence.start)
    .sort((left, right) => left.start - right.start);
  const leading = normalized.find((silence) => silence.start <= tolerance);
  const trailing = [...normalized].reverse().find((silence) => silence.end >= duration - tolerance);
  const start = Math.max(0, (leading?.end ?? 0) - padding);
  const end = Math.min(duration, (trailing?.start ?? duration) + padding);
  if (end <= start) return { start: 0, end: duration, duration, trimmed: false };
  return {
    start,
    end,
    duration: end - start,
    trimmed: start > 0 || end < duration,
  };
}

export function planVoiceSegments({
  silences,
  audioDuration,
  segmentCount,
  segmentWeights,
  minimumBoundarySilence = DEFAULT_BOUNDARY_SILENCE_SECONDS,
  edgeTolerance = DEFAULT_EDGE_TOLERANCE_SECONDS,
  protection = DEFAULT_PROTECTION_SECONDS,
}) {
  const duration = finiteNumber(audioDuration, 'audioDuration');
  const count = Number(segmentCount);
  if (duration <= 0) throw new Error('audioDuration must be greater than zero.');
  if (!Number.isInteger(count) || count < 1) throw new Error('segmentCount must be a positive integer.');

  const normalized = (Array.isArray(silences) ? silences : [])
    .map((silence, index) => {
      const start = finiteNumber(silence?.start, `silences[${index}].start`);
      const end = finiteNumber(silence?.end, `silences[${index}].end`);
      const silenceDuration = finiteNumber(silence?.duration ?? end - start, `silences[${index}].duration`);
      if (start < 0 || end <= start || end > duration + edgeTolerance) {
        throw new Error(`silences[${index}] is outside the audio duration.`);
      }
      return { start, end: Math.min(duration, end), duration: silenceDuration };
    })
    .sort((left, right) => left.start - right.start);

  const boundaries = normalized.filter((silence) => (
    silence.start > edgeTolerance
    && silence.end < duration - edgeTolerance
    && silence.duration >= minimumBoundarySilence
  ));
  const expectedBoundaries = count - 1;
  if (boundaries.length < expectedBoundaries) {
    throw new Error(
      `Expected at least ${expectedBoundaries} reliable inter-scene silence(s), found ${boundaries.length}.`,
    );
  }
  let selectedBoundaries = boundaries;
  if (boundaries.length > expectedBoundaries) {
    const weights = Array.isArray(segmentWeights) ? segmentWeights.map(Number) : [];
    if (weights.length !== count || weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) {
      throw new Error(
        `Expected exactly ${expectedBoundaries} reliable inter-scene silence(s), found ${boundaries.length}; `
        + 'valid segmentWeights are required to resolve surplus pauses.',
      );
    }
    const totalWeight = weights.reduce((total, weight) => total + weight, 0);
    let cumulativeWeight = 0;
    const targets = weights.slice(0, -1).map((weight) => {
      cumulativeWeight += weight;
      return duration * cumulativeWeight / totalWeight;
    });
    let states = boundaries.map((boundary, candidateIndex) => ({
      candidateIndex,
      score: Math.abs((boundary.start + boundary.end) / 2 - targets[0]) ** 2,
      selected: [candidateIndex],
    })).filter((state) => state.candidateIndex <= boundaries.length - expectedBoundaries);
    for (let targetIndex = 1; targetIndex < targets.length; targetIndex += 1) {
      const nextStates = [];
      for (let candidateIndex = targetIndex; candidateIndex < boundaries.length; candidateIndex += 1) {
        const previous = states
          .filter((state) => state.candidateIndex < candidateIndex)
          .sort((left, right) => left.score - right.score)[0];
        if (!previous) continue;
        const midpoint = (boundaries[candidateIndex].start + boundaries[candidateIndex].end) / 2;
        nextStates.push({
          candidateIndex,
          score: previous.score + Math.abs(midpoint - targets[targetIndex]) ** 2,
          selected: [...previous.selected, candidateIndex],
        });
      }
      states = nextStates;
    }
    const best = states.sort((left, right) => left.score - right.score)[0];
    if (!best || best.selected.length !== expectedBoundaries) {
      throw new Error('Could not align surplus voice pauses to the expected scene boundaries.');
    }
    selectedBoundaries = best.selected.map((index) => boundaries[index]);
    const maximumBoundaryError = Math.max(2.5, duration / count * 0.4);
    const excessiveError = selectedBoundaries.find((boundary, index) => (
      Math.abs((boundary.start + boundary.end) / 2 - targets[index]) > maximumBoundaryError
    ));
    if (excessiveError) {
      throw new Error(
        `Could not reliably align ${boundaries.length} pauses to ${expectedBoundaries} scene boundaries.`,
      );
    }
  }

  const leadingSilence = normalized.find((silence) => silence.start <= edgeTolerance);
  const trailingSilence = [...normalized].reverse()
    .find((silence) => silence.end >= duration - edgeTolerance);
  const starts = [leadingSilence?.end ?? 0, ...selectedBoundaries.map((silence) => silence.end)];
  const ends = [...selectedBoundaries.map((silence) => silence.start), trailingSilence?.start ?? duration];
  const padding = Math.max(0, Number(protection) || 0);

  return starts.map((start, index) => {
    const end = ends[index];
    const protectedStart = Math.max(0, start - padding);
    const protectedEnd = Math.min(duration, end + padding);
    if (protectedEnd <= protectedStart) {
      throw new Error(`Voice segment ${index + 1} has no audible duration.`);
    }
    return {
      index,
      start: protectedStart,
      end: protectedEnd,
      duration: protectedEnd - protectedStart,
      leadingBoundary: index === 0 ? null : selectedBoundaries[index - 1],
      trailingBoundary: index === count - 1 ? null : selectedBoundaries[index],
    };
  });
}
