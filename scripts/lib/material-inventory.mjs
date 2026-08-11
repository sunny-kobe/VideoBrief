export function materialInventorySources(project) {
  const scenes = Array.isArray(project?.scenes) ? project.scenes : [];
  return (Array.isArray(project?.sources) ? project.sources : []).map((source) => ({
    id: source.id,
    label: source.label,
    sourceType: source.sourceType,
    materialRole: source.materialRole,
    originalFileName: source.originalFileName ?? '',
    originUrl: source.originUrl,
    assetPath: source.assetPath,
    verificationStatus: source.verificationStatus,
    rightsStatus: source.rightsStatus,
    rightsNote: source.rightsNote,
    contentHash: source.contentHash ?? source.processing?.inputHash ?? '',
    reusedFrom: source.reusedFrom ?? null,
    processingStatus: source.processing?.status ?? 'legacy',
    facts: source.analysis?.facts ?? [],
    uncertainties: source.analysis?.uncertainties ?? [],
    plannedWindows: scenes.flatMap((scene) => (
      (Array.isArray(scene.candidates) ? scene.candidates : [])
        .filter((candidate) => candidate.sourceId === source.id)
        .map((candidate) => ({
          sceneId: scene.id,
          sceneTitle: scene.title ?? '',
          visualRequirement: scene.visualRequirement ?? '',
          narration: scene.narration ?? '',
          candidateId: candidate.id,
          sourceStart: Number(candidate.sourceStart ?? 0),
          sourceEnd: Number(candidate.sourceEnd ?? 0),
          matchReason: candidate.matchReason ?? '',
          rightsStatus: candidate.rightsStatus ?? source.rightsStatus,
          selected: scene.selectedCandidateId === candidate.id,
          selectionStatus: scene.selectionStatus ?? 'unselected',
        }))
    )),
  }));
}

export function buildMaterialInventory(project) {
  return {
    schemaVersion: 1,
    projectId: project.id,
    materialReview: project.materialReview,
    materialQualityReview: project.materialQualityReview ?? null,
    sources: materialInventorySources(project),
  };
}
