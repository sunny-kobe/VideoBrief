export const MAX_NARRATION_TAIL_SECONDS = 1.25;

export function inspectNarrationTailGaps(scenes, maximumTailSeconds = MAX_NARRATION_TAIL_SECONDS) {
  const limit = Number(maximumTailSeconds);
  if (!Number.isFinite(limit) || limit < 0) {
    throw new Error('maximumTailSeconds must be a non-negative number.');
  }

  const checks = (Array.isArray(scenes) ? scenes : []).flatMap((scene) => {
    const explicitDuration = Number(scene?.duration);
    const start = Number(scene?.start);
    const end = Number(scene?.end);
    const duration = Number.isFinite(explicitDuration) && explicitDuration > 0
      ? explicitDuration
      : Number.isFinite(start) && Number.isFinite(end) && end > start
        ? end - start
        : null;
    const speechDuration = Number(scene?.speechDuration);
    if (duration == null || !Number.isFinite(speechDuration) || speechDuration < 0) return [];

    const tailSeconds = Math.max(0, duration - speechDuration);
    return [{
      sceneId: String(scene?.id ?? ''),
      duration,
      speechDuration,
      tailSeconds,
      maximumTailSeconds: limit,
      passed: tailSeconds <= limit + 0.001,
    }];
  });

  return {
    maximumTailSeconds: limit,
    checks,
    excessive: checks.filter((check) => !check.passed),
  };
}
