export function planSubtitleCues({ phrases, speechDuration, silences = [] }) {
  const inputPhrases = (Array.isArray(phrases) ? phrases : [])
    .map((phrase) => String(phrase).trim())
    .filter(Boolean);
  const normalizedPhrases = [];
  for (const phrase of inputPhrases) {
    const characterCount = Array.from(phrase.replace(/\s/g, '')).length;
    if (characterCount <= 2 && normalizedPhrases.length > 0) {
      normalizedPhrases[normalizedPhrases.length - 1] += phrase;
    } else {
      normalizedPhrases.push(phrase);
    }
  }
  if (
    normalizedPhrases.length > 1
    && Array.from(normalizedPhrases[0].replace(/\s/g, '')).length <= 2
  ) {
    normalizedPhrases[1] = `${normalizedPhrases[0]}${normalizedPhrases[1]}`;
    normalizedPhrases.shift();
  }
  const duration = Math.max(0, Number(speechDuration) || 0);
  if (!normalizedPhrases.length || duration <= 0) return [];

  const weights = normalizedPhrases.map((phrase) => (
    Math.max(1, Array.from(phrase.replace(/\s/g, '')).length)
  ));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  const candidates = (Array.isArray(silences) ? silences : [])
    .map((silence, index) => ({
      index,
      start: Math.max(0, Number(silence.start) || 0),
      end: Math.min(duration, Number(silence.end) || 0),
    }))
    .filter((silence) => silence.end - silence.start >= 0.15)
    .map((silence) => ({ ...silence, midpoint: (silence.start + silence.end) / 2 }));

  const usedSilenceIndexes = new Set();
  const boundaries = [0];
  let accumulatedWeight = 0;
  for (let index = 0; index < normalizedPhrases.length - 1; index += 1) {
    accumulatedWeight += weights[index];
    const weightedBoundary = duration * accumulatedWeight / totalWeight;
    const previous = boundaries.at(-1) ?? 0;
    const nearest = candidates
      .filter((candidate) => !usedSilenceIndexes.has(candidate.index))
      .filter((candidate) => candidate.midpoint > previous + 0.2 && candidate.midpoint < duration - 0.2)
      .filter((candidate) => Math.abs(candidate.midpoint - weightedBoundary) <= 1.5)
      .sort((left, right) => Math.abs(left.midpoint - weightedBoundary) - Math.abs(right.midpoint - weightedBoundary))[0];
    const boundary = nearest?.midpoint ?? weightedBoundary;
    if (nearest) usedSilenceIndexes.add(nearest.index);
    boundaries.push(Math.max(previous + 0.08, Math.min(duration - 0.08, boundary)));
  }
  boundaries.push(duration);

  const cues = normalizedPhrases.map((text, index) => ({
    start: Number(boundaries[index].toFixed(3)),
    end: Number(boundaries[index + 1].toFixed(3)),
    text,
    alignment: usedSilenceIndexes.size > 0 ? 'silence-assisted' : 'character-weighted',
  }));
  const minimumCueDuration = 0.75;
  const merged = [];
  for (const cue of cues) {
    if (cue.end - cue.start < minimumCueDuration && merged.length > 0) {
      const previous = merged.at(-1);
      const separator = /\p{Script=Han}$/u.test(previous.text) && /^[A-Za-z0-9]/.test(cue.text)
        ? ' '
        : '';
      previous.text = `${previous.text}${separator}${cue.text}`;
      previous.end = cue.end;
    } else {
      merged.push({ ...cue });
    }
  }
  if (merged.length > 1 && merged[0].end - merged[0].start < minimumCueDuration) {
    const first = merged.shift();
    merged[0].start = first.start;
    merged[0].text = `${first.text}${merged[0].text}`;
  }
  return merged;
}
