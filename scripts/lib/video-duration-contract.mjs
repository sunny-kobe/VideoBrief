export const MIN_PROJECT_DURATION_SECONDS = 3;
export const MAX_PROJECT_DURATION_SECONDS = 900;
export const LONG_FORM_THRESHOLD_SECONDS = 180;
export const LONG_FORM_MIN_DURATION_RATIO = 0.85;
export const LONG_FORM_MAX_DURATION_RATIO = 1.15;

export function validateProjectTargetDuration(value) {
  const targetDurationSeconds = Number(value);
  const issues = [];
  if (!Number.isFinite(targetDurationSeconds)) {
    issues.push('Target duration must be a finite number.');
  } else {
    if (targetDurationSeconds < MIN_PROJECT_DURATION_SECONDS) {
      issues.push(`Target duration must be at least ${MIN_PROJECT_DURATION_SECONDS} seconds.`);
    }
    if (targetDurationSeconds > MAX_PROJECT_DURATION_SECONDS) {
      issues.push(`Target duration must not exceed ${MAX_PROJECT_DURATION_SECONDS} seconds.`);
    }
  }
  return {
    passed: issues.length === 0,
    targetDurationSeconds,
    issues,
  };
}

export function validateRenderedDuration(targetValue, renderedValue) {
  const target = validateProjectTargetDuration(targetValue);
  const renderedDurationSeconds = Number(renderedValue);
  const applies = target.passed && target.targetDurationSeconds >= LONG_FORM_THRESHOLD_SECONDS;
  const minimumDurationSeconds = applies
    ? target.targetDurationSeconds * LONG_FORM_MIN_DURATION_RATIO
    : null;
  const maximumDurationSeconds = applies
    ? target.targetDurationSeconds * LONG_FORM_MAX_DURATION_RATIO
    : null;
  const issues = [...target.issues];

  if (!Number.isFinite(renderedDurationSeconds) || renderedDurationSeconds <= 0) {
    issues.push('Rendered duration must be a positive finite number.');
  } else if (applies && (
    renderedDurationSeconds < minimumDurationSeconds
    || renderedDurationSeconds > maximumDurationSeconds
  )) {
    issues.push(
      `Long-form output duration ${renderedDurationSeconds.toFixed(2)}s is outside `
      + `${minimumDurationSeconds.toFixed(2)}-${maximumDurationSeconds.toFixed(2)}s `
      + `for the ${target.targetDurationSeconds.toFixed(2)}s target.`,
    );
  }

  return {
    passed: issues.length === 0,
    applies,
    targetDurationSeconds: target.targetDurationSeconds,
    renderedDurationSeconds,
    minimumDurationSeconds,
    maximumDurationSeconds,
    issues,
  };
}

export function assertProjectTargetDuration(value) {
  const validation = validateProjectTargetDuration(value);
  if (!validation.passed) throw new Error(validation.issues.join(' '));
  return validation.targetDurationSeconds;
}

export function assertRenderedDuration(targetValue, renderedValue) {
  const validation = validateRenderedDuration(targetValue, renderedValue);
  if (!validation.passed) throw new Error(validation.issues.join(' '));
  return validation;
}
