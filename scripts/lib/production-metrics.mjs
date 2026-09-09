function timestampMs(value) {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function elapsedMs(start, end) {
  const startMs = timestampMs(start);
  const endMs = timestampMs(end);
  return startMs == null || endMs == null || endMs < startMs ? null : endMs - startMs;
}

function callDurationMs(call) {
  return elapsedMs(call?.startedAt, call?.completedAt) ?? 0;
}

export function buildProductionMetrics({ project, manifest, finalizedAt }) {
  const aiCalls = Array.isArray(project?.ai?.calls) ? project.ai.calls : [];
  const isLocalCall = (call) => (
    call?.transport === 'local'
    || String(call?.model ?? '').startsWith('whisper.cpp:')
    || String(call?.model ?? '').startsWith('reused-local-')
  );
  const externalAiCalls = aiCalls.filter((call) => !isLocalCall(call));
  const localCalls = aiCalls.filter(isLocalCall);
  const aiCacheHits = externalAiCalls.filter((call) => call.cacheHit === true).length;
  const aiExternalRequests = externalAiCalls.filter((call) => call.cacheHit !== true).length;
  const failedAiCalls = aiCalls.filter((call) => call.status === 'failed');
  const failedExternalAiCalls = failedAiCalls.filter((call) => !isLocalCall(call));
  const failedLocalCalls = failedAiCalls.filter(isLocalCall);
  const voiceoverBatch = manifest?.voiceover?.batch;
  const voiceoverSegments = Array.isArray(manifest?.voiceover?.segments)
    ? manifest.voiceover.segments
    : [];
  const voiceoverRequestRecords = voiceoverBatch ? [voiceoverBatch] : voiceoverSegments;
  const voiceoverCacheHits = voiceoverRequestRecords.filter((item) => item.cacheHit === true).length;
  const voiceoverExternalRequests = voiceoverRequestRecords.filter((item) => item.cacheHit !== true).length;
  const semantic = manifest?.acceptance?.semantic;
  const browser = manifest?.acceptance?.browser;
  const manualReviewActiveSeconds = semantic?.activeSeconds != null
    && String(semantic.activeSeconds).trim() !== ''
    && Number.isFinite(Number(semantic.activeSeconds))
    && Number(semantic.activeSeconds) >= 0
    ? Number(semantic.activeSeconds)
    : null;
  const reviewMeasurement = manualReviewActiveSeconds == null
    ? 'not_recorded'
    : semantic?.activeSecondsSource === 'review-session'
      ? 'system_measured'
      : 'legacy_recorded';
  const finalAcceptanceAt = browser?.status === 'passed' ? browser.checkedAt : '';

  return {
    schemaVersion: 1,
    finalizedAt,
    renderCache: manifest?.productionMetrics?.renderCache ?? null,
    elapsed: {
      projectCalendarMs: elapsedMs(project?.production?.trackingStartedAt, finalizedAt),
      renderToTechnicalProofMs: elapsedMs(manifest?.renderedAt, manifest?.proof?.checkedAt),
      renderToSemanticAcceptanceMs: elapsedMs(manifest?.renderedAt, semantic?.checkedAt),
      renderToBrowserAcceptanceMs: elapsedMs(manifest?.renderedAt, browser?.checkedAt),
      renderToFinalAcceptanceMs: elapsedMs(manifest?.renderedAt, finalAcceptanceAt),
      renderToPackageMs: elapsedMs(manifest?.renderedAt, finalizedAt),
      stages: {
        ...(manifest?.productionMetrics?.elapsed?.stages ?? {}),
        ...(manifest?.productionMetrics?.stages ?? {}),
      },
    },
    operatorActive: {
      manualReviewSeconds: manualReviewActiveSeconds,
      measurement: reviewMeasurement,
      source: manualReviewActiveSeconds == null ? '' : semantic?.activeSecondsSource ?? 'legacy-manual',
    },
    requests: {
      aiRecorded: aiCalls.length,
      aiLocalRecorded: localCalls.length,
      aiExternal: aiExternalRequests,
      aiCacheHits,
      aiFailed: failedAiCalls.length,
      voiceoverRecorded: voiceoverRequestRecords.length,
      voiceoverExternal: voiceoverExternalRequests,
      voiceoverCacheHits,
      totalExternal: aiExternalRequests + voiceoverExternalRequests,
    },
    failureCost: {
      failedAiCalls: failedAiCalls.length,
      failedAiExternalRequests: failedExternalAiCalls.filter((call) => call.cacheHit !== true).length,
      failedLocalCalls: failedLocalCalls.length,
      failedAiWallMs: failedExternalAiCalls.reduce((total, call) => total + callDurationMs(call), 0),
      failedLocalWallMs: failedLocalCalls.reduce((total, call) => total + callDurationMs(call), 0),
      renderFailures: Number(project?.production?.renderFailureCount ?? 0),
      sourceProcessingFailures: Array.isArray(project?.sources)
        ? project.sources.filter((source) => source?.processing?.status === 'failed').length
        : 0,
      monetaryCostUsd: null,
      monetaryCostStatus: 'unavailable_without_provider_usage_and_price_data',
    },
  };
}
