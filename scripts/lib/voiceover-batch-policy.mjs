export function providerHttpStatus(error) {
  let current = error;
  const seen = new Set();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if (Number.isInteger(current.status)) return current.status;
    current = current.cause;
  }
  return null;
}

export function errorCode(error) {
  let current = error;
  const seen = new Set();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if (typeof current.code === 'string') return current.code;
    current = current.cause;
  }
  return null;
}

export function shouldFallbackBatchVoiceover(error) {
  let current = error;
  const seen = new Set();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if (current.permanent === true) return false;
    current = current.cause;
  }
  return providerHttpStatus(error) !== 429 && errorCode(error) !== 'SCENE_TIMING_INVALID';
}
