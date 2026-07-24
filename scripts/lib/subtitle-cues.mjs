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

  return normalizedPhrases.map((text, index) => ({
    start: Number(boundaries[index].toFixed(3)),
    end: Number(boundaries[index + 1].toFixed(3)),
    text,
    alignment: usedSilenceIndexes.size > 0 ? 'silence-assisted' : 'character-weighted',
  }));
}
