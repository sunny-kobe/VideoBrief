export function normalizeNarrationText(value) {
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[他她它]/g, '它')
    .replace(/下[划滑]线/g, '_')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function levenshteinDistance(left, right) {
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

export function verifyNarrationTerms(expectedText, transcriptText, terms = []) {
  const expected = normalizeNarrationText(expectedText);
  const transcript = normalizeNarrationText(transcriptText);
  const configured = (Array.isArray(terms) ? terms : [])
    .map((entry) => typeof entry === 'string'
      ? { term: entry.trim(), aliases: [] }
      : {
          term: String(entry?.term ?? '').trim(),
          aliases: [...new Set((Array.isArray(entry?.aliases) ? entry.aliases : [])
            .map((alias) => String(alias).trim()).filter(Boolean))],
        })
    .filter((entry) => entry.term);
  return [...new Map(configured.map((entry) => [entry.term, entry])).values()]
    .map(({ term, aliases }) => {
      const normalized = normalizeNarrationText(term);
      const relevant = Boolean(normalized) && expected.includes(normalized);
      const matchedAlias = relevant
        ? [term, ...aliases].find((candidate) => transcript.includes(normalizeNarrationText(candidate))) ?? ''
        : '';
      return {
        term,
        aliases,
        relevant,
        matched: !relevant || Boolean(matchedAlias),
        matchedAlias,
      };
    });
}

export function verifyNarrationTranscript(expectedText, transcriptText, terms = []) {
  const expected = normalizeNarrationText(expectedText);
  const transcript = normalizeNarrationText(transcriptText);
  const distance = levenshteinDistance(expected, transcript);
  const similarity = expected.length || transcript.length
    ? 1 - distance / Math.max(expected.length, transcript.length)
    : 1;
  const lengthRatio = expected.length ? transcript.length / expected.length : 0;
  const warnings = [];
  if (similarity < 0.9) warnings.push(`反向转写相似度为 ${(similarity * 100).toFixed(1)}%，需人工核对专名和发音。`);
  if (lengthRatio < 0.9) warnings.push('反向转写明显短于原文，可能存在漏读。');
  if (lengthRatio > 1.1) warnings.push('反向转写明显长于原文，可能存在重复或额外内容。');
  const termChecks = verifyNarrationTerms(expectedText, transcriptText, terms);
  const unmatchedTerms = termChecks.filter((check) => check.relevant && !check.matched);
  if (unmatchedTerms.length > 0) {
    warnings.push(`专名反向转写未精确命中：${unmatchedTerms.map((check) => check.term).join('、')}；需按 1 倍速人工确认。`);
  }
  return {
    passed: similarity >= 0.78 && lengthRatio >= 0.75 && lengthRatio <= 1.25,
    similarity,
    lengthRatio,
    expectedCharacters: expected.length,
    transcriptCharacters: transcript.length,
    termChecks,
    warnings,
  };
}
