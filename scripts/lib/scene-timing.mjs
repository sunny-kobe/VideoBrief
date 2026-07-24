const VIDEO_WINDOW_TOLERANCE_SECONDS = 0.12;

export function resolveSceneTiming({
  sceneId,
  sourceType,
  sourceStart,
  sourceEnd,
  voiceDuration,
  fps = 30,
}) {
  const normalizedStart = Number(sourceStart ?? 0);
  const normalizedEnd = Number(sourceEnd);
  const normalizedFps = Number(fps);
  if (!Number.isFinite(normalizedFps) || normalizedFps <= 0) {
    throw new Error(`Scene ${sceneId} requires a positive render fps.`);
  }
  const hasSelectedWindow = Number.isFinite(normalizedEnd) && normalizedEnd > normalizedStart;
  const selectedDuration = hasSelectedWindow ? normalizedEnd - normalizedStart : 0;

  if (sourceType === 'video' && !hasSelectedWindow) {
    throw new Error(`Scene ${sceneId} requires an explicit video sourceStart/sourceEnd window.`);
  }
  const rawDuration = sourceType === 'video'
    ? selectedDuration
    : Math.max(voiceDuration, selectedDuration || voiceDuration);
  const frameCount = sourceType === 'video'
    ? Math.floor(rawDuration * normalizedFps + 1e-6)
    : Math.ceil(rawDuration * normalizedFps - 1e-6);
  const duration = frameCount / normalizedFps;
  if (sourceType === 'video' && duration + VIDEO_WINDOW_TOLERANCE_SECONDS < voiceDuration) {
    throw new Error(
      `Scene ${sceneId} frame-aligned video window is ${duration.toFixed(2)}s, shorter than its ${voiceDuration.toFixed(2)}s narration. Select a longer semantic clip instead of looping it.`,
    );
  }

  return {
    sourceStart: normalizedStart,
    sourceEnd: hasSelectedWindow ? normalizedEnd : normalizedStart,
    renderSourceEnd: sourceType === 'video' ? normalizedStart + duration : null,
    duration,
    frameCount,
    selectedDuration,
  };
}
