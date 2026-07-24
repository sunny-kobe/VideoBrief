import { createHash } from 'node:crypto';

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildChapterFingerprints({ project, renderPlan, renderSettings, voiceSettings }) {
  const chapters = Array.isArray(project?.chapters) ? [...project.chapters] : [];
  const scenes = Array.isArray(project?.scenes) ? project.scenes.filter((scene) => scene.enabled !== false) : [];
  const renderedById = new Map((renderPlan?.scenes ?? []).map((scene) => [scene.id, scene]));
  const sharedInput = { render: renderSettings, voice: voiceSettings };
  const sharedFingerprint = sha256(sharedInput);
  const fingerprints = chapters
    .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0))
    .map((chapter) => {
      const sceneIds = Array.isArray(chapter.sceneIds)
        ? chapter.sceneIds.filter((id) => scenes.some((scene) => scene.id === id))
        : scenes.filter((scene) => scene.chapterId === chapter.id).map((scene) => scene.id);
      const chapterScenes = sceneIds.map((sceneId) => {
        const scene = scenes.find((item) => item.id === sceneId);
        const rendered = renderedById.get(sceneId);
        if (!scene || !rendered) throw new Error(`Chapter ${chapter.id} references unrendered scene ${sceneId}.`);
        return {
          id: scene.id,
          chapterId: scene.chapterId,
          narration: scene.narration,
          eyebrow: scene.eyebrow,
          title: scene.title,
          subtitle: scene.subtitle,
          visualRequirement: scene.visualRequirement,
          sourceReferences: scene.sourceReferences,
          sourceId: scene.sourceId,
          sourceStart: scene.sourceStart,
          sourceEnd: scene.sourceEnd,
          selectedCandidateId: scene.selectedCandidateId,
          showEditorialOverlay: scene.showEditorialOverlay !== false,
          segmentCacheKey: rendered.cacheKey ?? '',
          segmentSha256: rendered.segmentSha256 ?? '',
          sourceSha256: rendered.descriptor?.source?.sha256 ?? '',
          audioSha256: rendered.descriptor?.audioSha256 ?? '',
          duration: Number(rendered.descriptor?.duration ?? 0),
          frameCount: Number(rendered.frameCount ?? 0),
        };
      });
      const input = {
        sharedFingerprint,
        chapter: {
          id: chapter.id,
          order: chapter.order,
          title: chapter.title,
          summary: chapter.summary,
          objective: chapter.objective ?? '',
          targetDurationSeconds: chapter.targetDurationSeconds ?? null,
          evidenceUnitIds: chapter.evidenceUnitIds ?? [],
          sourceReferences: chapter.sourceReferences ?? [],
          script: chapter.script ?? '',
        },
        scenes: chapterScenes,
      };
      return {
        chapterId: chapter.id,
        order: Number(chapter.order ?? 0),
        sceneIds,
        durationSeconds: chapterScenes.reduce((total, scene) => total + scene.duration, 0),
        fingerprint: sha256(input),
      };
    });
  return {
    schemaVersion: 1,
    sharedFingerprint,
    chapters: fingerprints,
  };
}

export function buildSemanticReviewReuse(previousManifest, currentFingerprints) {
  const previousFingerprints = previousManifest?.chapterFingerprints;
  const previousSemantic = previousManifest?.acceptance?.semantic;
  if (
    previousFingerprints?.schemaVersion !== 1
    || previousSemantic?.status !== 'passed'
    || !previousManifest?.acceptance?.videoSha256
  ) {
    return {
      sourceVideoSha256: '',
      reusedChapterIds: [],
      invalidatedChapterIds: currentFingerprints.chapters.map((chapter) => chapter.chapterId),
      reusedSceneReviews: [],
      reusedDurationSeconds: 0,
      changedDurationSeconds: currentFingerprints.chapters.reduce(
        (total, chapter) => total + chapter.durationSeconds,
        0,
      ),
    };
  }
  const previousById = new Map(previousFingerprints.chapters.map((chapter) => [chapter.chapterId, chapter]));
  const previousReviews = new Map((previousSemantic.scenes ?? []).map((scene) => [scene.sceneId, scene]));
  const reusedChapters = currentFingerprints.chapters.filter((chapter) => {
    const previous = previousById.get(chapter.chapterId);
    return previous?.fingerprint === chapter.fingerprint
      && JSON.stringify(previous.sceneIds) === JSON.stringify(chapter.sceneIds)
      && chapter.sceneIds.every((sceneId) => previousReviews.get(sceneId)?.status === 'passed');
  });
  const reusedChapterIds = reusedChapters.map((chapter) => chapter.chapterId);
  const reusedSceneReviews = reusedChapters.flatMap((chapter) => chapter.sceneIds.map((sceneId) => ({
    sceneId,
    chapterId: chapter.chapterId,
    note: previousReviews.get(sceneId).note,
    reviewedAt: previousSemantic.checkedAt,
    reviewer: previousSemantic.reviewer,
    sourceVideoSha256: previousManifest.acceptance.videoSha256,
  })));
  return {
    sourceVideoSha256: previousManifest.acceptance.videoSha256,
    reusedChapterIds,
    invalidatedChapterIds: currentFingerprints.chapters
      .filter((chapter) => !reusedChapterIds.includes(chapter.chapterId))
      .map((chapter) => chapter.chapterId),
    reusedSceneReviews,
    reusedDurationSeconds: reusedChapters.reduce((total, chapter) => total + chapter.durationSeconds, 0),
    changedDurationSeconds: currentFingerprints.chapters
      .filter((chapter) => !reusedChapterIds.includes(chapter.chapterId))
      .reduce((total, chapter) => total + chapter.durationSeconds, 0),
  };
}

export function validateChapterFingerprintManifest({ project, renderPlan, manifest }) {
  if (Number(project?.brief?.targetDurationSeconds) < 180) return [];
  const issues = [];
  if (!Array.isArray(project?.chapters) || project.chapters.length === 0) {
    return ['Long-form technical proof requires canonical chapters.'];
  }
  if (manifest?.chapterFingerprints?.schemaVersion !== 1) {
    return ['Long-form render manifest is missing chapter fingerprints.'];
  }
  let expected;
  try {
    expected = buildChapterFingerprints({
      project,
      renderPlan,
      renderSettings: {
        width: manifest.render?.width,
        height: manifest.render?.height,
        fps: manifest.render?.fps,
        mediaFit: manifest.render?.mediaFit,
        renderStrategy: manifest.render?.renderStrategy,
      },
      voiceSettings: {
        engine: manifest.render?.voiceEngine,
        model: manifest.render?.voiceModel,
        voice: manifest.render?.voice,
        rate: manifest.render?.rate,
        profile: manifest.render?.voiceProfile,
        style: manifest.render?.voiceStyle,
        pronunciations: manifest.render?.pronunciations ?? [],
        generationMode: manifest.render?.voiceGenerationMode,
      },
    });
  } catch (error) {
    return [error instanceof Error ? error.message : 'Could not rebuild chapter fingerprints.'];
  }
  if (JSON.stringify(expected) !== JSON.stringify(manifest.chapterFingerprints)) {
    issues.push('Long-form chapter fingerprints do not match the canonical project and render plan.');
  }
  const chapterIds = expected.chapters.map((chapter) => chapter.chapterId);
  const reused = manifest.semanticReviewReuse?.reusedChapterIds ?? [];
  const invalidated = manifest.semanticReviewReuse?.invalidatedChapterIds ?? [];
  if (
    new Set([...reused, ...invalidated]).size !== chapterIds.length
    || chapterIds.some((chapterId) => !reused.includes(chapterId) && !invalidated.includes(chapterId))
    || reused.some((chapterId) => invalidated.includes(chapterId) || !chapterIds.includes(chapterId))
  ) {
    issues.push('Semantic review reuse does not partition the current long-form chapters.');
  }
  const reusedSceneIds = new Set(expected.chapters
    .filter((chapter) => reused.includes(chapter.chapterId))
    .flatMap((chapter) => chapter.sceneIds));
  for (const review of manifest.semanticReviewReuse?.reusedSceneReviews ?? []) {
    if (!reusedSceneIds.has(review.sceneId) || !String(review.note ?? '').trim()) {
      issues.push(`Semantic review reuse contains an invalid scene review: ${review.sceneId ?? 'unknown'}.`);
    }
  }
  return issues;
}
