import type {
  ProcessingStatus,
  ProjectMaterialReview,
  ShortVideoProjectScene,
  ShortVideoSource,
} from './shortVideoBrief';

export function automaticSourceReadiness(statuses: ProcessingStatus[]) {
  if (statuses.some((status) => status === 'idle' || status === 'pending' || status === 'running')) {
    return { ready: false, reason: '还有素材未完成解析。' } as const;
  }
  if (!statuses.includes('completed')) {
    return { ready: false, reason: '没有素材成功完成解析。' } as const;
  }
  return { ready: true, reason: '' } as const;
}

export function sourceIdsRequiringAutomaticProcessing(
  sources: Array<Pick<ShortVideoSource, 'id' | 'processing'>>,
) {
  return sources
    .filter((source) => (
      source.processing.status === 'idle'
      || source.processing.status === 'pending'
      || source.processing.status === 'running'
    ))
    .map((source) => source.id);
}

export function materialReviewReadiness(
  review: ProjectMaterialReview,
  sources: ShortVideoSource[],
) {
  if (review.status !== 'approved') {
    return { ready: false, reason: '请先在素材页预览并确认本次成片使用的素材包。' } as const;
  }
  const approvedSources = review.approvedSourceIds.flatMap((sourceId) => {
    const source = sources.find((item) => item.id === sourceId);
    return source ? [source] : [];
  });
  if (approvedSources.some((source) => source.materialRole === 'research')) {
    return { ready: false, reason: '已确认的素材包中包含仅供研究参考的素材。' } as const;
  }
  if (!approvedSources.some((source) => source.sourceType === 'video' || source.sourceType === 'image')) {
    return { ready: false, reason: '已确认的素材包中没有可用于画面的图片或视频。' } as const;
  }
  if (approvedSources.some((source) => source.rightsStatus === 'blocked')) {
    return { ready: false, reason: '已确认的素材包中包含禁止使用的素材。' } as const;
  }
  return { ready: true, reason: '' } as const;
}

export function sceneSelectionReadiness(
  scenes: ShortVideoProjectScene[],
  approvedSourceIds: string[],
) {
  const enabledScenes = scenes.filter((scene) => scene.enabled);
  const approved = new Set(approvedSourceIds);
  const unapprovedScene = enabledScenes.find((scene) => !approved.has(scene.sourceId));
  if (unapprovedScene) {
    return {
      ready: false,
      reason: `场景「${unapprovedScene.title || unapprovedScene.id}」仍在使用未批准素材，请重新生成或选择画面。`,
    } as const;
  }
  const unreviewedScene = enabledScenes.find((scene) => (
    scene.selectionStatus !== 'codex_reviewed' && scene.selectionStatus !== 'user_approved'
  ));
  if (unreviewedScene) {
    return {
      ready: false,
      reason: `场景「${unreviewedScene.title || unreviewedScene.id}」仍是 AI 推荐，必须经过 Codex 复核或用户确认。`,
    } as const;
  }
  const mismatchedScene = enabledScenes.find((scene) => {
    const candidate = scene.candidates.find((item) => item.id === scene.selectedCandidateId);
    return !candidate
      || candidate.sourceId !== scene.sourceId
      || candidate.sourceStart !== scene.sourceStart
      || candidate.sourceEnd !== scene.sourceEnd;
  });
  if (mismatchedScene) {
    return {
      ready: false,
      reason: `场景「${mismatchedScene.title || mismatchedScene.id}」的确认候选与 sourceId/sourceStart/sourceEnd 不一致。`,
    } as const;
  }
  return { ready: true, reason: '' } as const;
}
