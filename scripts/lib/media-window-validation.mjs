const WINDOW_TOLERANCE_SECONDS = 0.12;

export function validateVideoWindow({ sceneId, sourceDuration, sourceStart, sourceEnd }) {
  const duration = Number(sourceDuration);
  const start = Number(sourceStart);
  const end = Number(sourceEnd);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Scene ${sceneId} source duration could not be verified.`);
  }
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end <= start) {
    throw new Error(`Scene ${sceneId} has an invalid video source window.`);
  }
  if (end > duration + WINDOW_TOLERANCE_SECONDS) {
    throw new Error(
      `Scene ${sceneId} sourceEnd ${end.toFixed(2)}s exceeds the real media duration ${duration.toFixed(2)}s.`,
    );
  }

  return { sourceDuration: duration, sourceStart: start, sourceEnd: end };
}
