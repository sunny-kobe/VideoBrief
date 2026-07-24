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

export function shouldFallbackBatchVoiceover(error) {
  return providerHttpStatus(error) !== 429;
}
