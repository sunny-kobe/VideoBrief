const MINIMUM_REVIEW_NOTE_LENGTH = 12;

export const EDITORIAL_QUALITY_CHECK_IDS = [
  'opening',
  'visualReadability',
  'pacing',
  'subtitleReadability',
  'pronunciation',
  'platformFit',
  'cta',
];

export function validateSemanticReviewRequest({
  decision,
  reviewer,
  note,
  freezeIntervalCount = 0,
  confirmFreezeWarnings = false,
  pronunciationWarningCount = 0,
  confirmPronunciationWarnings = false,
  sceneCount = 0,
  videoDurationSeconds = 0,
  reviewDurationSeconds = videoDurationSeconds,
  activeSeconds,
  activeSecondsSource,
}) {
  const issues = [];
  const normalizedReviewer = String(reviewer ?? '').trim();
  const normalizedNote = String(note ?? '').trim();

  if (!['pending', 'passed', 'failed'].includes(decision)) {
    issues.push('decision must be pending, passed or failed.');
  }
  if (decision !== 'pending' && !normalizedReviewer) {
    issues.push('reviewer is required when recording a passed or failed semantic review.');
  }
  if (decision !== 'pending' && normalizedNote.length < MINIMUM_REVIEW_NOTE_LENGTH) {
    issues.push(`A concrete semantic review note of at least ${MINIMUM_REVIEW_NOTE_LENGTH} characters is required.`);
  }
  if (decision === 'passed' && freezeIntervalCount > 0 && !confirmFreezeWarnings) {
    issues.push(
      `${freezeIntervalCount} freeze warning(s) require explicit --confirm-freezes acknowledgement.`,
    );
  }
  if (decision === 'passed' && pronunciationWarningCount > 0 && !confirmPronunciationWarnings) {
    issues.push(
      `${pronunciationWarningCount} pronunciation warning(s) require explicit --confirm-pronunciations acknowledgement.`,
    );
  }
  const normalizedActiveSeconds = Number(activeSeconds);
  if (decision !== 'pending' && activeSecondsSource !== 'review-session') {
    issues.push('Completed semantic review time must come from a system-measured review session.');
  }
  if (decision !== 'pending' && (!Number.isFinite(normalizedActiveSeconds) || normalizedActiveSeconds <= 0)) {
    issues.push('A positive system-measured review duration is required for a completed semantic review.');
  }
  const normalizedSceneCount = Math.max(0, Math.floor(Number(sceneCount) || 0));
  const normalizedVideoDuration = Math.max(0, Number(videoDurationSeconds) || 0);
  const normalizedReviewDuration = Math.max(0, Number(reviewDurationSeconds) || 0);
  const durationMinimum = normalizedVideoDuration >= 180
    ? Math.ceil(normalizedReviewDuration * 0.75)
    : 0;
  const minimumActiveSeconds = Math.max(30, normalizedSceneCount * 8, durationMinimum);
  if (decision !== 'pending'
    && Number.isFinite(normalizedActiveSeconds)
    && normalizedActiveSeconds > 0
    && normalizedActiveSeconds < minimumActiveSeconds) {
    issues.push(
      `Semantic review active time ${normalizedActiveSeconds}s is below the ${minimumActiveSeconds}s minimum for ${normalizedSceneCount} scene(s).`,
    );
  }

  return {
    valid: issues.length === 0,
    reviewer: normalizedReviewer,
    note: normalizedNote,
    minimumActiveSeconds,
    reviewDurationSeconds: normalizedReviewDuration,
    activeSeconds: Number.isFinite(normalizedActiveSeconds) && normalizedActiveSeconds > 0
      ? normalizedActiveSeconds
      : null,
    issues,
  };
}

export function validateReviewSession({
  session,
  projectId,
  projectFingerprint,
  videoSha256,
  now = new Date().toISOString(),
}) {
  const issues = [];
  const startedAtMs = Date.parse(String(session?.startedAt ?? ''));
  const nowMs = Date.parse(String(now));
  if (!session || typeof session !== 'object' || Array.isArray(session)) {
    issues.push('Semantic review session is missing.');
  } else {
    if (session.status !== 'active') issues.push('Semantic review session is not active.');
    if (!String(session.sessionId ?? '').trim()) issues.push('Semantic review session id is missing.');
    if (session.projectId !== projectId) issues.push('Semantic review session belongs to another project.');
    if (session.projectFingerprint !== projectFingerprint) {
      issues.push('Semantic review session belongs to another project version.');
    }
    if (session.videoSha256 !== videoSha256) {
      issues.push('Semantic review session belongs to another rendered video.');
    }
  }
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs) || nowMs < startedAtMs) {
    issues.push('Semantic review session timestamps are invalid.');
  }
  const activeSeconds = Number.isFinite(startedAtMs) && Number.isFinite(nowMs) && nowMs >= startedAtMs
    ? Math.floor((nowMs - startedAtMs) / 1000)
    : null;
  return { valid: issues.length === 0, activeSeconds, issues };
}

export function validateSemanticAcceptanceRecord(semantic) {
  const issues = [];
  if (semantic?.status !== 'passed') issues.push('Semantic review has not passed.');
  if (semantic?.activeSecondsSource !== 'review-session') {
    issues.push('Semantic review duration is not backed by a review session.');
  }
  if (!String(semantic?.reviewSessionId ?? '').trim()) {
    issues.push('Semantic review session id is missing.');
  }
  const activeSeconds = Number(semantic?.activeSeconds);
  const minimumActiveSeconds = Number(semantic?.minimumActiveSeconds);
  if (!Number.isFinite(activeSeconds) || activeSeconds <= 0) {
    issues.push('Semantic review duration is missing.');
  }
  if (!Number.isFinite(minimumActiveSeconds) || activeSeconds < minimumActiveSeconds) {
    issues.push('Semantic review duration is below the recorded minimum.');
  }
  if (semantic?.editorialQuality?.status !== 'passed') {
    issues.push('Structured editorial quality review has not passed.');
  }
  return { passed: issues.length === 0, issues };
}

export function validateEditorialQualityReview({ decision, review }) {
  const issues = [];
  if (decision !== 'passed') {
    return { valid: true, review: null, issues };
  }
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    return {
      valid: false,
      review: null,
      issues: ['A structured --quality-review JSON file is required for semantic approval.'],
    };
  }
  const profile = String(review.profile ?? '').trim();
  if (!profile) issues.push('Editorial quality review profile is required.');
  const checks = review.checks && typeof review.checks === 'object' && !Array.isArray(review.checks)
    ? review.checks
    : {};
  const unknownCheckIds = Object.keys(checks).filter((id) => !EDITORIAL_QUALITY_CHECK_IDS.includes(id));
  if (unknownCheckIds.length > 0) {
    issues.push(`Editorial quality review contains unknown check id(s): ${unknownCheckIds.join(', ')}.`);
  }
  const normalizedChecks = {};
  for (const id of EDITORIAL_QUALITY_CHECK_IDS) {
    const check = checks[id];
    const status = String(check?.status ?? '').trim();
    const note = String(check?.note ?? '').trim();
    normalizedChecks[id] = { status, note };
    if (status !== 'passed') issues.push(`Editorial quality check ${id} must be passed.`);
    if (note.length < MINIMUM_REVIEW_NOTE_LENGTH) {
      issues.push(
        `Editorial quality check ${id} requires a concrete note of at least ${MINIMUM_REVIEW_NOTE_LENGTH} characters.`,
      );
    }
  }
  return {
    valid: issues.length === 0,
    review: {
      schemaVersion: 1,
      profile,
      status: issues.length === 0 ? 'passed' : 'failed',
      checks: normalizedChecks,
    },
    issues,
  };
}

export function intervalCoverage(intervals, duration) {
  const normalizedDuration = Number(duration);
  if (!Number.isFinite(normalizedDuration) || normalizedDuration <= 0) {
    return { seconds: 0, ratio: 0 };
  }
  const normalized = (Array.isArray(intervals) ? intervals : [])
    .map((interval) => ({
      start: Math.max(0, Math.min(normalizedDuration, Number(interval?.start))),
      end: Math.max(0, Math.min(normalizedDuration, Number(interval?.end))),
    }))
    .filter((interval) => Number.isFinite(interval.start)
      && Number.isFinite(interval.end)
      && interval.end > interval.start)
    .sort((left, right) => left.start - right.start);
  const merged = [];
  for (const interval of normalized) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  const seconds = merged.reduce((total, interval) => total + interval.end - interval.start, 0);
  return { seconds, ratio: seconds / normalizedDuration };
}

export function validateSceneReviewNotes({ decision, sceneIds, requiredSceneIds = sceneIds, sceneNotes }) {
  const issues = [];
  const ids = Array.isArray(sceneIds) ? sceneIds.map((id) => String(id)) : [];
  const requiredIds = Array.isArray(requiredSceneIds)
    ? requiredSceneIds.map((id) => String(id))
    : ids;
  const notes = sceneNotes && typeof sceneNotes === 'object' && !Array.isArray(sceneNotes)
    ? sceneNotes
    : {};

  if (decision === 'passed') {
    for (const sceneId of requiredIds) {
      if (!ids.includes(sceneId)) {
        issues.push(`Required scene review references unknown scene id ${sceneId}.`);
        continue;
      }
      const note = String(notes[sceneId] ?? '').trim();
      if (note.length < MINIMUM_REVIEW_NOTE_LENGTH) {
        issues.push(`Scene ${sceneId} requires a concrete review note of at least ${MINIMUM_REVIEW_NOTE_LENGTH} characters.`);
      }
    }
  }

  const unknownSceneIds = Object.keys(notes).filter((sceneId) => !ids.includes(sceneId));
  if (unknownSceneIds.length > 0) {
    issues.push(`Scene review notes contain unknown scene id(s): ${unknownSceneIds.join(', ')}.`);
  }

  return {
    valid: issues.length === 0,
    notes: Object.fromEntries(ids.map((sceneId) => [sceneId, String(notes[sceneId] ?? '').trim()])),
    issues,
  };
}

export function validateBrowserChecks(checks, expectedDuration) {
  const issues = [];
  const duration = Number(expectedDuration);
  const values = Array.isArray(checks) ? checks : [];
  const desktop = values.find((check) => Number(check.viewport?.width) >= 1000);
  const mobile = values.find((check) => Number(check.viewport?.width) <= 500);

  if (!desktop) issues.push('Desktop browser acceptance check is missing.');
  if (!mobile) issues.push('Mobile browser acceptance check is missing.');

  for (const check of values) {
    const label = check.name || `${check.viewport?.width ?? '?'}x${check.viewport?.height ?? '?'}`;
    if (Number(check.readyState ?? 0) < 3) issues.push(`${label}: video readyState is below 3.`);
    if (!Number.isFinite(Number(check.duration)) || Math.abs(Number(check.duration) - duration) > 0.35) {
      issues.push(`${label}: browser duration does not match the render manifest.`);
    }
    if (Number(check.playedSeconds ?? 0) < 0.25) issues.push(`${label}: playback did not advance.`);
    if (check.mediaError) issues.push(`${label}: media error: ${check.mediaError}`);
    if (Array.isArray(check.consoleErrors) && check.consoleErrors.length > 0) {
      issues.push(`${label}: ${check.consoleErrors.length} browser console error(s) were recorded.`);
    }
  }

  for (const required of [desktop, mobile].filter(Boolean)) {
    const label = required.name || `${required.viewport?.width ?? '?'}x${required.viewport?.height ?? '?'}`;
    if (required.fullPlayback !== true
      || required.ended !== true
      || Number(required.playedSeconds) < duration - 0.35
      || required.muted !== false
      || Number(required.volume) <= 0
      || Number(required.playbackRate) !== 1) {
      issues.push(`${label}: requires complete sequential non-muted playback at 1x speed.`);
    }
  }

  return { passed: issues.length === 0, issues };
}
