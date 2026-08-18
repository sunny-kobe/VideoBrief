function compactReference(reference) {
  return {
    sourceId: reference?.sourceId ?? '',
    locatorType: reference?.locatorType ?? 'file',
    ...(Number.isFinite(Number(reference?.start)) ? { start: Number(reference.start) } : {}),
    ...(Number.isFinite(Number(reference?.end)) ? { end: Number(reference.end) } : {}),
    ...(Number.isFinite(Number(reference?.lineStart)) ? { lineStart: Number(reference.lineStart) } : {}),
    ...(Number.isFinite(Number(reference?.lineEnd)) ? { lineEnd: Number(reference.lineEnd) } : {}),
    ...(reference?.note ? { note: String(reference.note) } : {}),
  };
}

function compactFact(fact) {
  return {
    id: fact?.id ?? '',
    statement: fact?.statement ?? '',
    reviewStatus: fact?.reviewStatus ?? 'proposed',
    reviewPriority: fact?.reviewPriority ?? 'supporting',
    briefRelevance: Number(fact?.briefRelevance ?? 0),
    sourceReferences: (fact?.sourceReferences ?? []).map(compactReference),
  };
}

function compactUncertainty(item) {
  return {
    id: item?.id ?? '',
    statement: item?.statement ?? '',
    resolution: item?.resolution ?? '',
    riskLevel: item?.riskLevel ?? 'medium',
    reviewPriority: item?.reviewPriority ?? 'supporting',
    briefRelevance: Number(item?.briefRelevance ?? 0),
    sourceReferences: (item?.sourceReferences ?? []).map(compactReference),
  };
}

function compactSource(source) {
  return {
    id: source?.id ?? '',
    label: source?.label ?? '',
    sourceType: source?.sourceType ?? '',
    materialRole: source?.materialRole ?? '',
    originUrl: source?.originUrl ?? '',
    assetPath: source?.assetPath ?? '',
    verificationStatus: source?.verificationStatus ?? '',
    rightsStatus: source?.rightsStatus ?? '',
    rightsNote: source?.rightsNote ?? '',
    processing: {
      status: source?.processing?.status ?? 'idle',
      attempts: Number(source?.processing?.attempts ?? 0),
      cacheHit: source?.processing?.cacheHit === true,
      error: source?.processing?.error ?? '',
    },
  };
}

function selectedCandidate(scene) {
  return (scene?.candidates ?? []).find((candidate) => candidate.id === scene.selectedCandidateId) ?? null;
}

function compactScene(scene) {
  const candidate = selectedCandidate(scene);
  return {
    id: scene?.id ?? '',
    enabled: scene?.enabled !== false,
    title: scene?.title ?? '',
    narration: scene?.narration ?? '',
    visualRequirement: scene?.visualRequirement ?? '',
    sourceId: scene?.sourceId ?? '',
    sourceStart: Number(scene?.sourceStart ?? 0),
    sourceEnd: Number(scene?.sourceEnd ?? 0),
    selectionStatus: scene?.selectionStatus ?? '',
    selectedCandidate: candidate ? {
      id: candidate.id,
      sourceId: candidate.sourceId,
      assetPath: candidate.assetPath,
      mediaType: candidate.mediaType,
      sourceStart: Number(candidate.sourceStart ?? 0),
      sourceEnd: Number(candidate.sourceEnd ?? 0),
      matchReason: candidate.matchReason ?? '',
      rightsStatus: candidate.rightsStatus ?? '',
    } : null,
    sourceReferences: (scene?.sourceReferences ?? []).map(compactReference),
  };
}

function baseContext(project, stage) {
  const workflow = project?.workflow ?? {};
  const compactApproval = (approval) => ({
    status: approval?.status ?? 'pending',
    decidedAt: approval?.decidedAt ?? '',
    decidedBy: approval?.decidedBy ?? '',
    note: approval?.note ?? '',
    fingerprint: approval?.fingerprint ?? '',
  });
  return {
    schemaVersion: 1,
    stage,
    project: {
      id: project?.id ?? '',
      title: project?.title ?? '',
      status: project?.status ?? '',
      technical_status: project?.technical_status ?? '',
      rights_status: project?.rights_status ?? '',
      publication_status: project?.publication_status ?? '',
      market_status: project?.market_status ?? '',
    },
    brief: project?.brief ?? {},
    workflow: {
      origin: workflow.origin ?? null,
      topicApproval: compactApproval(workflow.topicApproval),
      researchApproval: compactApproval(workflow.researchApproval),
      deliveryApproval: compactApproval(workflow.deliveryApproval),
      publicationApproval: compactApproval(workflow.publication?.approval),
      marketDecision: workflow.market?.decision ?? 'pending',
    },
  };
}

function reviewSummary(review) {
  if (!review) return null;
  return {
    schemaVersion: review.schemaVersion ?? 1,
    status: review.status ?? 'pending',
    reviewedAt: review.reviewedAt ?? '',
    reviewer: review.reviewer ?? '',
    reviewScope: review.reviewScope ?? '',
    sceneReviews: (review.sceneReviews ?? []).map((item) => ({
      sceneId: item.sceneId ?? '',
      decision: item.decision ?? '',
      evidenceRole: item.evidenceRole ?? '',
      visibleClaim: item.visibleClaim ?? '',
      narrationMatch: item.narrationMatch ?? null,
      platformWatermark: item.platformWatermark ?? null,
    })),
  };
}

export function buildProjectStageContext(project, stage, manifest = null) {
  if (!['research', 'material', 'delivery'].includes(stage)) {
    throw new Error(`Unsupported project context stage: ${stage}`);
  }
  const base = baseContext(project, stage);
  if (stage === 'research') {
    return {
      ...base,
      sources: (project?.sources ?? []).map(compactSource),
      confirmedFacts: (project?.research?.facts ?? [])
        .filter((fact) => fact.reviewStatus === 'confirmed' && fact.reviewPriority === 'required')
        .map(compactFact),
      blockingUncertainties: (project?.research?.uncertainties ?? [])
        .filter((item) => item.reviewPriority === 'required')
        .map(compactUncertainty),
    };
  }
  if (stage === 'material') {
    const scenes = (project?.scenes ?? []).filter((scene) => scene.enabled !== false).map(compactScene);
    const sourceIds = new Set(scenes.flatMap((scene) => [
      scene.sourceId,
      ...(scene.sourceReferences ?? []).map((reference) => reference.sourceId),
    ]).filter(Boolean));
    return {
      ...base,
      render: project?.render ?? {},
      scenes,
      sources: (project?.sources ?? []).filter((source) => sourceIds.has(source.id)).map(compactSource),
      materialQualityReview: reviewSummary(project?.materialQualityReview),
    };
  }
  return {
    ...base,
    render: project?.render ?? {},
    outputs: project?.outputs ?? {},
    scenes: (project?.scenes ?? []).filter((scene) => scene.enabled !== false).map((scene) => ({
      id: scene.id,
      sourceId: scene.sourceId,
      sourceStart: Number(scene.sourceStart ?? 0),
      sourceEnd: Number(scene.sourceEnd ?? 0),
      selectedCandidateId: scene.selectedCandidateId ?? '',
      selectionStatus: scene.selectionStatus ?? '',
    })),
    materialQualityReview: reviewSummary(project?.materialQualityReview),
    acceptance: manifest ? {
      videoSha256: manifest?.acceptance?.videoSha256 ?? '',
      render: manifest?.render ?? null,
      technicalProof: manifest?.proof ? {
        passed: manifest.proof.passed === true,
        checkedAt: manifest.proof.checkedAt ?? '',
        issues: manifest.proof.issues ?? [],
        quality: manifest.proof.quality ? {
          integratedLufs: manifest.proof.quality.integratedLufs ?? null,
          truePeakDbtp: manifest.proof.quality.truePeakDbtp ?? null,
          blackSegments: manifest.proof.quality.blackSegments ?? [],
          freezeIntervals: manifest.proof.quality.freezeIntervals ?? [],
          narrationTailGaps: manifest.proof.quality.narrationTailGaps ?? [],
          warnings: manifest.proof.quality.warnings ?? [],
          durationContract: manifest.proof.quality.durationContract ?? null,
        } : null,
        narration: manifest.proof.narration ? {
          passed: manifest.proof.narration.passed === true,
          provider: manifest.proof.narration.provider ?? '',
          model: manifest.proof.narration.model ?? '',
          similarity: manifest.proof.narration.similarity ?? null,
          lengthRatio: manifest.proof.narration.lengthRatio ?? null,
          warnings: manifest.proof.narration.warnings ?? [],
        } : null,
      } : null,
      semantic: manifest?.acceptance?.semantic ? {
        status: manifest.acceptance.semantic.status ?? 'pending',
        checkedAt: manifest.acceptance.semantic.checkedAt ?? '',
        reviewer: manifest.acceptance.semantic.reviewer ?? '',
        activeSeconds: manifest.acceptance.semantic.activeSeconds ?? null,
        reviewedSceneCount: manifest.acceptance.semantic.reviewedSceneCount ?? 0,
        issues: manifest.acceptance.semantic.issues ?? [],
        editorialQualityStatus: manifest.acceptance.semantic.editorialQuality?.status ?? 'pending',
      } : null,
      browser: manifest?.acceptance?.browser ? {
        status: manifest.acceptance.browser.status ?? 'pending',
        checkedAt: manifest.acceptance.browser.checkedAt ?? '',
        duration: manifest.acceptance.browser.duration ?? null,
        playedSeconds: manifest.acceptance.browser.playedSeconds ?? null,
        ended: manifest.acceptance.browser.ended === true,
        consoleErrors: manifest.acceptance.browser.consoleErrors ?? [],
        mediaError: manifest.acceptance.browser.mediaError ?? '',
        checks: (manifest.acceptance.browser.checks ?? []).map((check) => ({
          name: check.name,
          viewport: check.viewport,
          playedSeconds: check.playedSeconds,
          ended: check.ended,
          muted: check.muted,
          playbackRate: check.playbackRate,
          consoleErrors: check.consoleErrors ?? [],
          mediaError: check.mediaError ?? '',
        })),
        issues: manifest.acceptance.browser.issues ?? [],
      } : null,
    } : null,
  };
}
