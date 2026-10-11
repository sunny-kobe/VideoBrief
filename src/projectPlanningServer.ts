import { createHash } from 'node:crypto';
import { readAiConfig } from './aiConfig';
import {
  generateProductionAssets,
  planLongFormChapter,
  planLongFormOutline,
  planNarrative,
  rankCandidates,
  rankLongFormChapterCandidates,
} from './aiProvider';
import type { LongFormOutline } from './aiSchemas';
import {
  buildLongFormEvidenceUnits,
  deduplicateSourceReferences,
  evidenceUnitContainsReference,
  evidenceUnitsAllowReference,
  longFormCandidateWindowAllowed,
  longFormChapterVisualSourceIds,
  longFormNarrationBudget,
  normalizedNarrationText,
  selectLongFormEvidenceUnits,
  sourceReferenceLocatorsMatch,
} from './longFormPlanning';
import type {
  AiCallRecord,
  NarrativeVersion,
  ProjectChapter,
  SceneCandidate,
  ShortVideoProject,
  ShortVideoProjectScene,
  SourceReference,
} from './shortVideoBrief';
import { readBrief, updateCanonicalProject } from './shortVideoProjectServer';
import { researchReviewSummary } from './researchReview';
import { materialReviewReadiness } from './productionReadiness';
import { assertVoiceoverPreflightGates } from '../scripts/lib/production-workflow-contract.mjs';

function referenceFromAi(reference: {
  sourceId: string;
  locatorType: 'time' | 'line' | 'image' | 'file';
  start: number | null;
  end: number | null;
  lineStart: number | null;
  lineEnd: number | null;
  note: string;
}): SourceReference {
  return {
    sourceId: reference.sourceId,
    locatorType: reference.locatorType,
    ...(reference.locatorType === 'time' && reference.start != null ? { start: reference.start } : {}),
    ...(reference.locatorType === 'time' && reference.end != null ? { end: reference.end } : {}),
    ...(reference.locatorType === 'line' && reference.lineStart != null ? { lineStart: reference.lineStart } : {}),
    ...(reference.locatorType === 'line' && reference.lineEnd != null ? { lineEnd: reference.lineEnd } : {}),
    note: reference.note,
  };
}

function nextCall(project: ShortVideoProject, options: {
  purpose: AiCallRecord['purpose'];
  status: AiCallRecord['status'];
  model: string;
  promptVersion: string;
  inputHash: string;
  startedAt: string;
  error?: string;
  cacheHit?: boolean;
}): AiCallRecord {
  return {
    id: `ai-call-${String(project.ai.calls.length + 1).padStart(3, '0')}`,
    purpose: options.purpose,
    status: options.status,
    model: options.model,
    promptVersion: options.promptVersion,
    inputHash: options.inputHash,
    startedAt: options.startedAt,
    completedAt: new Date().toISOString(),
    error: options.error ?? '',
    cacheHit: options.cacheHit === true,
  };
}

function assertResearchReady(project: ShortVideoProject) {
  const review = researchReviewSummary(project);
  if (!review.allSourcesProcessed) {
    throw new Error('还有素材未完成解析；请先完成参与项目素材的处理。');
  }
  if (review.pendingFacts.length) {
    throw new Error(`还有 ${review.pendingFacts.length} 条关键主张待确认；请先确认或驳回。`);
  }
  if (!review.confirmedFacts.length) {
    throw new Error('至少确认一条关键主张后才能生成或应用叙事。');
  }
  if (review.unresolvedUncertainties.length) {
    throw new Error(`还有 ${review.unresolvedUncertainties.length} 条高风险问题待处理。`);
  }
}

function assertAutomaticProductionReady(project: ShortVideoProject) {
  assertVoiceoverPreflightGates(project);
}

function assertMaterialReviewReady(project: ShortVideoProject) {
  const readiness = materialReviewReadiness(project.materialReview, project.sources);
  if (!readiness.ready) throw new Error(readiness.reason);
}

function assertProjectReferences(
  project: ShortVideoProject,
  references: Array<{
    sourceId: string;
    locatorType: 'time' | 'line' | 'image' | 'file';
    start: number | null;
    end: number | null;
    lineStart: number | null;
    lineEnd: number | null;
    note: string;
  }>,
  context: string,
) {
  if (!references.length) throw new Error(`${context} has no source references.`);
  for (const reference of references) {
    const source = project.sources.find((item) => item.id === reference.sourceId);
    if (!source) throw new Error(`${context} references unknown sourceId ${reference.sourceId}.`);
    if (source.processing.status !== 'completed') {
      throw new Error(`${context} references source ${source.id} before processing completed.`);
    }
    if (reference.locatorType === 'time') {
      if (source.sourceType !== 'video' && source.sourceType !== 'audio') {
        throw new Error(`${context} used a time reference for ${source.sourceType}.`);
      }
      if (reference.start == null || reference.end == null || reference.start < 0 || reference.end < reference.start) {
        reference.locatorType = 'file';
        reference.start = null;
        reference.end = null;
        reference.note = `${reference.note}（模型未提供有效时间范围，已降级为文件级引用）`;
      }
    }
    if (reference.locatorType === 'line') {
      if (source.sourceType !== 'markdown' && source.sourceType !== 'text') {
        throw new Error(`${context} used a line reference for ${source.sourceType}.`);
      }
      if (
        reference.lineStart == null ||
        reference.lineEnd == null ||
        reference.lineStart < 1 ||
        reference.lineEnd < reference.lineStart
      ) {
        throw new Error(`${context} returned an invalid line range.`);
      }
    }
    if (reference.locatorType === 'image' && source.sourceType !== 'image' && source.sourceType !== 'video') {
      throw new Error(`${context} used an image reference for ${source.sourceType}.`);
    }
  }
}

function assertCandidateRankings(
  project: ShortVideoProject,
  scenes: ShortVideoProjectScene[],
  rankings: Array<{
    sceneIndex: number;
    sourceId: string;
    sourceStart: number;
    sourceEnd: number;
  }>,
  allowedSourceIds?: Set<string>,
) {
  const approvedSourceIds = new Set(project.materialReview.approvedSourceIds);
  for (const ranking of rankings) {
    if (ranking.sceneIndex < 0 || ranking.sceneIndex >= scenes.length) {
      throw new Error(`Candidate ranking references unknown sceneIndex ${ranking.sceneIndex}.`);
    }
    const source = project.sources.find((item) => item.id === ranking.sourceId);
    if (!source) throw new Error(`Candidate ranking references unknown sourceId ${ranking.sourceId}.`);
    if (!approvedSourceIds.has(source.id)) {
      throw new Error(`Candidate ranking references unapproved sourceId ${source.id}.`);
    }
    if (allowedSourceIds && !allowedSourceIds.has(source.id)) {
      throw new Error(`Candidate ranking references sourceId ${source.id} outside the current chapter.`);
    }
    if (source.sourceType !== 'video' && source.sourceType !== 'image') {
      throw new Error(`Candidate ranking source ${source.id} is not visual media.`);
    }
    if (ranking.sourceStart < 0 || ranking.sourceEnd <= ranking.sourceStart) {
      throw new Error(`Candidate ranking for scene ${ranking.sceneIndex} returned an invalid time range.`);
    }
  }
  for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex += 1) {
    if (!rankings.some((ranking) => ranking.sceneIndex === sceneIndex)) {
      throw new Error(`Candidate ranking omitted sceneIndex ${sceneIndex}.`);
    }
  }
}

export function initialCandidatesForScene(
  project: ShortVideoProject,
  references: SourceReference[],
  duration: number,
) {
  const referencedIds = new Set(references.map((reference) => reference.sourceId));
  const approvedSourceIds = new Set(project.materialReview.approvedSourceIds);
  const visualSources = project.sources.filter(
    (source) => approvedSourceIds.has(source.id)
      && (source.sourceType === 'video' || source.sourceType === 'image'),
  );
  const prioritized = [
    ...visualSources.filter((source) => source.sourceType === 'video' && referencedIds.has(source.id)),
    ...visualSources.filter((source) => source.sourceType === 'image' && referencedIds.has(source.id)),
    ...visualSources.filter((source) => source.sourceType === 'video' && source.materialRole === 'broll' && !referencedIds.has(source.id)),
    ...visualSources.filter((source) => source.sourceType === 'image' && source.materialRole === 'broll' && !referencedIds.has(source.id)),
  ];
  return prioritized.map<SceneCandidate>((source, index) => {
    const reference = references.find((item) => item.sourceId === source.id);
    const start = reference?.start ?? 0;
    const end = source.sourceType === 'video'
      ? Math.max(start + 1, reference?.end ?? start + duration)
      : duration;
    return {
      id: `candidate-${String(index + 1).padStart(2, '0')}`,
      sourceId: source.id,
      assetPath: source.assetPath,
      mediaType: source.sourceType === 'image' ? 'image' : 'video',
      sourceStart: start,
      sourceEnd: end,
      matchReason: reference?.note || '可用的自有视觉素材，等待 AI 排序和用户确认。',
      rightsStatus: source.rightsStatus,
    };
  });
}

function sameCandidate(left: SceneCandidate, right: SceneCandidate) {
  return left.sourceId === right.sourceId
    && left.assetPath === right.assetPath
    && left.mediaType === right.mediaType
    && left.sourceStart === right.sourceStart
    && left.sourceEnd === right.sourceEnd;
}

function preserveSelectedCandidate(
  scene: ShortVideoProjectScene,
  recommendations: SceneCandidate[],
) {
  if (!scene.selectedCandidateId) {
    return {
      candidates: recommendations,
      selectedCandidateId: '',
      selectionStatus: 'unselected' as const,
      selectionReviewedAt: '',
      selectionNote: '',
    };
  }
  const selected = scene.candidates.find((candidate) => candidate.id === scene.selectedCandidateId);
  if (!selected) {
    return {
      candidates: recommendations,
      selectedCandidateId: '',
      selectionStatus: 'unselected' as const,
      selectionReviewedAt: '',
      selectionNote: '',
    };
  }
  const usedIds = new Set([selected.id]);
  const remaining = recommendations
    .filter((candidate) => !sameCandidate(candidate, selected))
    .map((candidate, index) => {
      let id = candidate.id;
      while (usedIds.has(id)) id = `${candidate.id}-ai-${index + 1}`;
      usedIds.add(id);
      return { ...candidate, id };
    });
  return {
    candidates: [selected, ...remaining],
    selectedCandidateId: selected.id,
    selectionStatus: scene.selectionStatus,
    selectionReviewedAt: scene.selectionReviewedAt,
    selectionNote: scene.selectionNote,
  };
}

function buildProjectChapters(
  project: ShortVideoProject,
  outline: string[],
  inputScenes: ShortVideoProjectScene[],
) {
  if (!inputScenes.length) return { chapters: [] as ProjectChapter[], scenes: inputScenes };
  const longForm = project.brief.targetDurationSeconds >= 180;
  const outlineTitles = outline.map((title) => title.trim()).filter(Boolean);
  const chapterCount = longForm
    ? Math.max(1, Math.min(outlineTitles.length || 1, Math.ceil(inputScenes.length / 2)))
    : 1;
  const titles = Array.from({ length: chapterCount }, (_, index) => (
    outlineTitles[index] || `章节 ${index + 1}`
  ));
  const scenes = inputScenes.map((scene, index) => ({
    ...scene,
    chapterId: `chapter-${String(Math.min(
      chapterCount - 1,
      Math.floor(index * chapterCount / inputScenes.length),
    ) + 1).padStart(2, '0')}`,
  }));
  const chapters = titles.map<ProjectChapter>((title, index) => {
    const id = `chapter-${String(index + 1).padStart(2, '0')}`;
    const chapterScenes = scenes.filter((scene) => scene.chapterId === id);
    const sourceReferences = [...new Map(chapterScenes
      .flatMap((scene) => scene.sourceReferences)
      .map((reference) => [JSON.stringify(reference), reference])).values()];
    return {
      id,
      title,
      summary: chapterScenes.map((scene) => scene.narration).join(' ').slice(0, 800),
      order: index,
      sceneIds: chapterScenes.map((scene) => scene.id),
      sourceReferences,
    };
  });
  return { chapters, scenes };
}

function assertLongFormReferencesStayInsideEvidence(
  project: ShortVideoProject,
  evidenceUnitIds: string[],
  references: Array<{
    sourceId: string;
    locatorType: 'time' | 'line' | 'image' | 'file';
    start: number | null;
    end: number | null;
    lineStart: number | null;
    lineEnd: number | null;
    note: string;
  }>,
  context: string,
  allowUnconfirmedFacts: boolean,
  chapterReferences?: Array<{
    sourceId: string;
    locatorType: 'time' | 'line' | 'image' | 'file';
    start: number | null;
    end: number | null;
    lineStart: number | null;
    lineEnd: number | null;
  }>,
) {
  assertProjectReferences(project, references, context);
  const selected = selectLongFormEvidenceUnits(
    buildLongFormEvidenceUnits(project, allowUnconfirmedFacts),
    evidenceUnitIds,
  );
  for (const reference of references) {
    if (!selected.some((unit) => evidenceUnitContainsReference(unit, reference))) {
      throw new Error(`${context} references source content outside its selected evidence units.`);
    }
    if (!evidenceUnitsAllowReference(selected, reference, allowUnconfirmedFacts)) {
      throw new Error(`${context} must copy a locator from an eligible fact or uncertainty.`);
    }
    if (
      chapterReferences
      && !chapterReferences.some((allowed) => sourceReferenceLocatorsMatch(allowed, reference))
    ) {
      throw new Error(`${context} references a fact that the outline did not assign to this chapter.`);
    }
  }
}

function assertLongFormOutline(
  project: ShortVideoProject,
  outline: LongFormOutline,
  allowUnconfirmedFacts: boolean,
) {
  const units = buildLongFormEvidenceUnits(project, allowUnconfirmedFacts);
  const knownUnitIds = new Set(units.map((unit) => unit.id));
  const maximumChapters = Math.max(2, Math.min(10, Math.floor(project.brief.targetDurationSeconds / 30)));
  if (outline.chapters.length > maximumChapters) {
    throw new Error(`Long-form outline returned ${outline.chapters.length} chapters; maximum is ${maximumChapters}.`);
  }
  for (const [index, chapter] of outline.chapters.entries()) {
    const unknownIds = chapter.evidenceUnitIds.filter((id) => !knownUnitIds.has(id));
    if (unknownIds.length) {
      throw new Error(`Long-form chapter ${index + 1} referenced unknown evidence units: ${unknownIds.join(', ')}`);
    }
    assertLongFormReferencesStayInsideEvidence(
      project,
      chapter.evidenceUnitIds,
      chapter.sourceReferences,
      `Long-form outline chapter ${index + 1}`,
      allowUnconfirmedFacts,
    );
  }
  const plannedDuration = outline.chapters.reduce(
    (total, chapter) => total + chapter.targetDurationSeconds,
    0,
  );
  const target = project.brief.targetDurationSeconds;
  if (plannedDuration < target * 0.8 || plannedDuration > target * 1.2) {
    throw new Error(`Long-form outline duration ${plannedDuration}s does not match target ${target}s.`);
  }
}

async function generateLongFormNarrativeDraft(
  project: ShortVideoProject,
  options: { instruction?: string; automatic?: boolean },
) {
  const allowUnconfirmedFacts = options.automatic === true;
  const outlineOptions = {
    instruction: options.instruction,
    allowUnconfirmedFacts,
  };
  type OutlineResult = Awaited<ReturnType<typeof planLongFormOutline>>;
  let outlineResult: OutlineResult | undefined;
  let outlineValidationFeedback = '';
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    let validationFailure = '';
    try {
      outlineResult = await planLongFormOutline(project, (outline) => {
        try {
          assertLongFormOutline(project, outline, allowUnconfirmedFacts);
        } catch (error) {
          validationFailure = error instanceof Error ? error.message : 'Long-form outline validation failed.';
          throw error;
        }
      }, {
        ...outlineOptions,
        ...(outlineValidationFeedback ? { validationFeedback: outlineValidationFeedback } : {}),
      });
      break;
    } catch (error) {
      if (!validationFailure || attempt === 2) throw error;
      outlineValidationFeedback = validationFailure;
    }
  }
  if (!outlineResult) {
    throw new Error('Long-form outline generation did not return a validated result.');
  }
  const outline = outlineResult.data;
  const generatedAt = new Date().toISOString();
  const plannedChapters = outline.chapters.map<ProjectChapter>((chapter, index) => ({
    id: `chapter-${String(index + 1).padStart(2, '0')}`,
    title: chapter.title,
    summary: '',
    order: index,
    sceneIds: [],
    sourceReferences: chapter.sourceReferences.map(referenceFromAi),
    objective: chapter.objective,
    targetDurationSeconds: chapter.targetDurationSeconds,
    evidenceUnitIds: chapter.evidenceUnitIds,
    script: '',
  }));
  updateCanonicalProject(project.id, (current) => ({
    ...current,
    narrative: {
      ...current.narrative,
      pendingDraft: null,
      pendingScenes: [],
      pendingChapters: plannedChapters,
    },
    ai: {
      ...current.ai,
      model: outlineResult.model,
      calls: [...current.ai.calls, nextCall(current, {
        purpose: 'narrative-planning',
        status: 'completed',
        model: outlineResult.model,
        promptVersion: outlineResult.promptVersion,
        inputHash: outlineResult.inputHash,
        startedAt: generatedAt,
        cacheHit: outlineResult.cacheHit,
      })],
    },
  }));

  const completedChapters: ProjectChapter[] = [];
  const completedScenes: ShortVideoProjectScene[] = [];
  for (let chapterIndex = 0; chapterIndex < outline.chapters.length; chapterIndex += 1) {
    const chapterOutline = outline.chapters[chapterIndex];
    const chapterId = plannedChapters[chapterIndex].id;
    const chapterStartedAt = new Date().toISOString();
    const validateChapter: NonNullable<Parameters<typeof planLongFormChapter>[3]> = (chapter) => {
      assertLongFormReferencesStayInsideEvidence(
        project,
        chapterOutline.evidenceUnitIds,
        chapter.sourceReferences,
        `Long-form chapter ${chapterIndex + 1}`,
        allowUnconfirmedFacts,
        chapterOutline.sourceReferences,
      );
      chapter.scenes.forEach((scene, sceneIndex) => {
        assertLongFormReferencesStayInsideEvidence(
          project,
          chapterOutline.evidenceUnitIds,
          scene.sourceReferences,
          `Long-form chapter ${chapterIndex + 1} scene ${sceneIndex + 1}`,
          allowUnconfirmedFacts,
          chapterOutline.sourceReferences,
        );
      });
      const narrationCharacters = chapter.scenes.reduce(
        (total, scene) => total + Array.from(scene.narration.replace(/\s/g, '')).length,
        0,
      );
      const narrationBudget = longFormNarrationBudget(chapterOutline.targetDurationSeconds);
      if (
        narrationCharacters < narrationBudget.minimumCharacters
        || narrationCharacters > narrationBudget.maximumCharacters
      ) {
        throw new Error(
          `Long-form chapter ${chapterIndex + 1} narration is outside its budget: `
          + `${narrationCharacters}/${narrationBudget.minimumCharacters}-${narrationBudget.maximumCharacters}.`,
        );
      }
      const sceneScript = chapter.scenes.map((scene) => scene.narration).join('\n\n');
      if (normalizedNarrationText(chapter.voiceoverScript) !== normalizedNarrationText(sceneScript)) {
        throw new Error(`Long-form chapter ${chapterIndex + 1} voiceoverScript does not match its scenes.`);
      }
    };
    const chapterOptions = {
      instruction: options.instruction,
      allowUnconfirmedFacts,
    };
    let validationFailure = '';
    let result;
    try {
      result = await planLongFormChapter(project, outline, chapterIndex, (chapter) => {
        try {
          validateChapter(chapter);
        } catch (error) {
          validationFailure = error instanceof Error ? error.message : 'Long-form chapter validation failed.';
          throw error;
        }
      }, chapterOptions);
    } catch (error) {
      if (!validationFailure) throw error;
      result = await planLongFormChapter(project, outline, chapterIndex, validateChapter, {
        ...chapterOptions,
        validationFeedback: validationFailure,
      });
    }
    const sceneDuration = Math.max(
      2,
      chapterOutline.targetDurationSeconds / Math.max(1, result.data.scenes.length),
    );
    const chapterScenes = result.data.scenes.map<ShortVideoProjectScene>((scene, localIndex) => {
      const references = scene.sourceReferences.map(referenceFromAi);
      const candidates = initialCandidatesForScene(project, references, sceneDuration);
      const globalIndex = completedScenes.length + localIndex;
      return {
        id: `scene-${String(globalIndex + 1).padStart(2, '0')}`,
        chapterId,
        enabled: true,
        sourceId: candidates[0]?.sourceId ?? '',
        sourceStart: candidates[0]?.sourceStart ?? 0,
        sourceEnd: candidates[0]?.sourceEnd ?? sceneDuration,
        eyebrow: scene.eyebrow,
        title: scene.title,
        subtitle: scene.subtitle,
        narration: scene.narration,
        visualRequirement: scene.visualRequirement,
        sourceReferences: references,
        candidates,
        selectedCandidateId: '',
        selectionStatus: 'unselected',
        selectionReviewedAt: '',
        selectionNote: '',
        generatedBy: 'ai',
        userEdited: false,
      };
    });
    const completedChapter: ProjectChapter = {
      ...plannedChapters[chapterIndex],
      summary: result.data.summary,
      script: result.data.voiceoverScript,
      sceneIds: chapterScenes.map((scene) => scene.id),
      sourceReferences: deduplicateSourceReferences([
        ...plannedChapters[chapterIndex].sourceReferences,
        ...result.data.sourceReferences.map(referenceFromAi),
      ]),
      generatedAt: new Date().toISOString(),
      model: result.model,
      promptVersion: result.promptVersion,
      inputHash: result.inputHash,
      cacheHit: result.cacheHit,
    };
    completedChapters.push(completedChapter);
    completedScenes.push(...chapterScenes);
    updateCanonicalProject(project.id, (current) => ({
      ...current,
      narrative: {
        ...current.narrative,
        pendingChapters: plannedChapters.map((chapter, index) => (
          completedChapters[index] ?? chapter
        )),
        pendingScenes: completedScenes,
      },
      ai: {
        ...current.ai,
        model: result.model,
        calls: [...current.ai.calls, nextCall(current, {
          purpose: 'narrative-planning',
          status: 'completed',
          model: result.model,
          promptVersion: result.promptVersion,
          inputHash: result.inputHash,
          startedAt: chapterStartedAt,
          cacheHit: result.cacheHit,
        })],
      },
    }));
  }

  const sourceReferences = deduplicateSourceReferences([
    ...outline.chapters.flatMap((chapter) => chapter.sourceReferences.map(referenceFromAi)),
    ...completedChapters.flatMap((chapter) => chapter.sourceReferences),
  ]);
  const version: NarrativeVersion = {
    id: `narrative-${String(project.narrative.versions.length + 1).padStart(2, '0')}`,
    generatedAt,
    model: outlineResult.model,
    promptVersion: outlineResult.promptVersion,
    inputHash: createHash('sha256').update(JSON.stringify({
      outline: outlineResult.inputHash,
      chapters: completedChapters.map((chapter) => chapter.inputHash),
    })).digest('hex'),
    conclusion: outline.conclusion,
    hook: outline.hook,
    outline: completedChapters.map((chapter) => chapter.title),
    voiceoverScript: completedChapters.map((chapter) => chapter.script).join('\n\n'),
    sourceReferences,
    uncertainties: outline.uncertainties,
  };
  return updateCanonicalProject(project.id, (current) => ({
    ...current,
    narrative: {
      ...current.narrative,
      status: 'completed',
      error: '',
      pendingDraft: version,
      pendingScenes: completedScenes,
      pendingChapters: completedChapters,
      generatedAt,
      model: outlineResult.model,
      promptVersion: outlineResult.promptVersion,
    },
  }));
}

export async function generateNarrativeDraft(
  projectId: string,
  options: { instruction?: string; automatic?: boolean } = {},
) {
  const project = readBrief(projectId);
  if (!project.sources.length) throw new Error('请先导入并处理来源资料。');
  if (!project.sources.some((source) => source.processing.status === 'completed')) {
    throw new Error('至少一个来源必须完成资料理解后才能生成叙事。');
  }
  assertMaterialReviewReady(project);
  if (options.automatic) assertAutomaticProductionReady(project);
  else assertResearchReady(project);
  const startedAt = new Date().toISOString();
  updateCanonicalProject(projectId, (current) => ({
    ...current,
    narrative: { ...current.narrative, status: 'running', error: '' },
  }));

  try {
    if (project.brief.targetDurationSeconds >= 180) {
      return await generateLongFormNarrativeDraft(project, options);
    }
    const result = await planNarrative(project, (data) => {
      assertProjectReferences(project, data.sourceReferences, 'Narrative plan');
      data.scenes.forEach((scene, index) => {
        assertProjectReferences(project, scene.sourceReferences, `Narrative scene ${index + 1}`);
      });
      const narrationCharacters = data.scenes.reduce(
        (total, scene) => total + Array.from(scene.narration.replace(/\s/g, '')).length,
        0,
      );
      const maximumCharacters = Math.max(42, Math.round(project.brief.targetDurationSeconds * 5.5));
      if (narrationCharacters > maximumCharacters) {
        throw new Error(
          `AI 旁白超出时长预算：${narrationCharacters} 字，最多 ${maximumCharacters} 字。请要求压缩脚本后重试。`,
        );
      }
    }, {
      instruction: options.instruction,
      allowUnconfirmedFacts: options.automatic === true,
    });
    const generatedAt = new Date().toISOString();
    const version: NarrativeVersion = {
      id: `narrative-${String(project.narrative.versions.length + 1).padStart(2, '0')}`,
      generatedAt,
      model: result.model,
      promptVersion: result.promptVersion,
      inputHash: result.inputHash,
      conclusion: result.data.conclusion,
      hook: result.data.hook,
      outline: result.data.outline,
      voiceoverScript: result.data.voiceoverScript,
      sourceReferences: result.data.sourceReferences.map(referenceFromAi),
      uncertainties: result.data.uncertainties,
    };
    const sceneDuration = Math.max(
      2,
      project.brief.targetDurationSeconds / Math.max(1, result.data.scenes.length),
    );
    const draftScenes = result.data.scenes.map<ShortVideoProjectScene>((scene, index) => {
      const references = scene.sourceReferences.map(referenceFromAi);
      const candidates = initialCandidatesForScene(project, references, sceneDuration);
      return {
        id: `scene-${String(index + 1).padStart(2, '0')}`,
        chapterId: '',
        enabled: true,
        sourceId: candidates[0]?.sourceId ?? '',
        sourceStart: candidates[0]?.sourceStart ?? 0,
        sourceEnd: candidates[0]?.sourceEnd ?? sceneDuration,
        eyebrow: scene.eyebrow,
        title: scene.title,
        subtitle: scene.subtitle,
        narration: scene.narration,
        visualRequirement: scene.visualRequirement,
        sourceReferences: references,
        candidates,
        selectedCandidateId: '',
        selectionStatus: 'unselected',
        selectionReviewedAt: '',
        selectionNote: '',
        generatedBy: 'ai',
        userEdited: false,
      };
    });
    const { chapters, scenes } = buildProjectChapters(project, result.data.outline, draftScenes);
    return updateCanonicalProject(projectId, (current) => {
      const record = nextCall(current, {
        purpose: 'narrative-planning',
        status: 'completed',
        model: result.model,
        promptVersion: result.promptVersion,
        inputHash: result.inputHash,
        startedAt,
        cacheHit: result.cacheHit,
      });
      return {
        ...current,
        narrative: {
          ...current.narrative,
          status: 'completed',
          error: '',
          pendingDraft: version,
          pendingScenes: scenes,
          pendingChapters: chapters,
          generatedAt,
          model: result.model,
          promptVersion: result.promptVersion,
        },
        ai: { ...current.ai, model: result.model, calls: [...current.ai.calls, record] },
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 叙事生成失败';
    const config = readAiConfig();
    updateCanonicalProject(projectId, (current) => {
      const record = nextCall(current, {
        purpose: 'narrative-planning',
        status: 'failed',
        model: config.model,
        promptVersion: config.promptVersion,
        inputHash: createHash('sha256').update(JSON.stringify({ brief: current.brief, research: current.research })).digest('hex'),
        startedAt,
        error: message,
      });
      return {
        ...current,
        narrative: { ...current.narrative, status: 'failed', error: message },
        ai: { ...current.ai, calls: [...current.ai.calls, record] },
      };
    });
    throw error;
  }
}

export function applyNarrativeDraft(
  projectId: string,
  confirmReplace: boolean,
  options: { automatic?: boolean } = {},
) {
  return updateCanonicalProject(projectId, (project) => {
    assertMaterialReviewReady(project);
    if (options.automatic) assertAutomaticProductionReady(project);
    else assertResearchReady(project);
    const draft = project.narrative.pendingDraft;
    if (!draft || !project.narrative.pendingScenes.length) throw new Error('没有待应用的叙事草案。');
    if (project.scenes.length > 0 && !confirmReplace) {
      throw new Error('当前项目已有场景，必须明确确认替换。');
    }
    const versions = project.narrative.versions.some((version) => version.id === draft.id)
      ? project.narrative.versions
      : [...project.narrative.versions, draft];
    return {
      ...project,
      editorial: { ...project.editorial, claim: draft.conclusion },
      narrative: {
        ...project.narrative,
        activeVersionId: draft.id,
        versions,
        pendingDraft: null,
        pendingScenes: [],
        pendingChapters: [],
      },
      scenes: project.narrative.pendingScenes,
      chapters: project.narrative.pendingChapters,
    };
  });
}

export function discardNarrativeDraft(projectId: string) {
  return updateCanonicalProject(projectId, (project) => ({
    ...project,
    narrative: {
      ...project.narrative,
      status: 'idle',
      error: '',
      pendingDraft: null,
      pendingScenes: [],
      pendingChapters: [],
    },
  }));
}

function applyCandidateRankingsToScene(
  project: ShortVideoProject,
  scene: ShortVideoProjectScene,
  rankings: Array<{
    sourceId: string;
    sourceStart: number;
    sourceEnd: number;
    matchReason: string;
  }>,
  autoSelect: boolean,
) {
  const candidates = rankings.flatMap<SceneCandidate>((item, index) => {
    const source = project.sources.find((entry) => entry.id === item.sourceId);
    if (!source || (source.sourceType !== 'video' && source.sourceType !== 'image')) return [];
    return [{
      id: `candidate-${String(index + 1).padStart(2, '0')}`,
      sourceId: source.id,
      assetPath: source.assetPath,
      mediaType: source.sourceType,
      sourceStart: Math.max(0, item.sourceStart),
      sourceEnd: Math.max(item.sourceStart + 1, item.sourceEnd),
      matchReason: item.matchReason,
      rightsStatus: source.rightsStatus,
    }];
  });
  if (!candidates.length) return scene;
  if (autoSelect) {
    const selected = candidates[0];
    return {
      ...scene,
      candidates,
      selectedCandidateId: selected.id,
      selectionStatus: 'ai_suggested' as const,
      selectionReviewedAt: '',
      selectionNote: 'AI 候选排序自动选择，尚未经过 Codex 或用户复核。',
      sourceId: selected.sourceId,
      sourceStart: selected.sourceStart,
      sourceEnd: selected.sourceEnd,
    };
  }
  const preserved = preserveSelectedCandidate(scene, candidates);
  return { ...scene, ...preserved };
}

async function generateLongFormCandidateRecommendations(
  projectId: string,
  project: ShortVideoProject,
  options: { automatic?: boolean; autoSelect?: boolean },
) {
  const chapters = [...project.chapters].sort((left, right) => left.order - right.order);
  if (!chapters.length) throw new Error('长视频缺少章节，必须先完成逐章叙事策划。');
  for (const chapter of chapters) {
    const chapterScenes = project.scenes.filter((scene) => scene.chapterId === chapter.id);
    if (!chapterScenes.length) throw new Error(`章节 ${chapter.id} 没有可排序的场景。`);
    const allowedSourceIds = new Set(longFormChapterVisualSourceIds(project, chapter));
    if (!allowedSourceIds.size) throw new Error(`章节 ${chapter.id} 没有可用的视觉来源。`);
    const startedAt = new Date().toISOString();
    const result = await rankLongFormChapterCandidates(project, chapter, chapterScenes, (data) => {
      assertCandidateRankings(project, chapterScenes, data.rankings, allowedSourceIds);
      for (const ranking of data.rankings) {
        if (!longFormCandidateWindowAllowed(project, chapter, ranking)) {
          throw new Error(`Candidate ranking for chapter ${chapter.id} escapes its evidence-unit window.`);
        }
      }
    });
    updateCanonicalProject(projectId, (current) => {
      const chapterSceneIndex = new Map(chapterScenes.map((scene, index) => [scene.id, index]));
      const scenes = current.scenes.map((scene) => {
        const localIndex = chapterSceneIndex.get(scene.id);
        if (localIndex == null) return scene;
        return applyCandidateRankingsToScene(
          current,
          scene,
          result.data.rankings.filter((item) => item.sceneIndex === localIndex),
          options.autoSelect === true,
        );
      });
      const record = nextCall(current, {
        purpose: 'candidate-ranking',
        status: 'completed',
        model: result.model,
        promptVersion: result.promptVersion,
        inputHash: result.inputHash,
        startedAt,
        cacheHit: result.cacheHit,
      });
      return {
        ...current,
        scenes,
        ai: { ...current.ai, model: result.model, calls: [...current.ai.calls, record] },
      };
    });
  }
  return readBrief(projectId);
}

export async function generateCandidateRecommendations(
  projectId: string,
  options: { automatic?: boolean; autoSelect?: boolean } = {},
) {
  const project = readBrief(projectId);
  assertMaterialReviewReady(project);
  if (options.automatic) assertAutomaticProductionReady(project);
  else assertResearchReady(project);
  if (!project.scenes.length) throw new Error('请先生成或创建场景。');
  const startedAt = new Date().toISOString();
  try {
    if (project.brief.targetDurationSeconds >= 180) {
      return await generateLongFormCandidateRecommendations(projectId, project, options);
    }
    const result = await rankCandidates(project, (data) => {
      assertCandidateRankings(project, project.scenes, data.rankings);
    });
    return updateCanonicalProject(projectId, (current) => {
      const scenes = current.scenes.map((scene, sceneIndex) => {
        const ranked = result.data.rankings.filter((item) => item.sceneIndex === sceneIndex);
        return applyCandidateRankingsToScene(current, scene, ranked, options.autoSelect === true);
      });
      const record = nextCall(current, {
        purpose: 'candidate-ranking',
        status: 'completed',
        model: result.model,
        promptVersion: result.promptVersion,
        inputHash: result.inputHash,
        startedAt,
        cacheHit: result.cacheHit,
      });
      return { ...current, scenes, ai: { ...current.ai, model: result.model, calls: [...current.ai.calls, record] } };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '候选画面生成失败';
    const config = readAiConfig();
    updateCanonicalProject(projectId, (current) => {
      const record = nextCall(current, {
        purpose: 'candidate-ranking',
        status: 'failed',
        model: config.model,
        promptVersion: config.promptVersion,
        inputHash: createHash('sha256').update(JSON.stringify(current.scenes)).digest('hex'),
        startedAt,
        error: message,
      });
      return { ...current, ai: { ...current.ai, calls: [...current.ai.calls, record] } };
    });
    throw error;
  }
}

export async function generateProductionAssetDraft(
  projectId: string,
  options: { automatic?: boolean } = {},
) {
  const project = readBrief(projectId);
  assertMaterialReviewReady(project);
  if (options.automatic) assertAutomaticProductionReady(project);
  else assertResearchReady(project);
  if (!project.scenes.length) throw new Error('请先确认脚本和场景。');
  const startedAt = new Date().toISOString();
  try {
    const result = await generateProductionAssets(project);
    return updateCanonicalProject(projectId, (current) => {
      const record = nextCall(current, {
        purpose: 'production-assets',
        status: 'completed',
        model: result.model,
        promptVersion: result.promptVersion,
        inputHash: result.inputHash,
        startedAt,
        cacheHit: result.cacheHit,
      });
      return {
        ...current,
        platformCopy: {
          coverTitle: result.data.coverTitle,
          title: result.data.platformTitle,
          description: result.data.description,
          hashtags: result.data.hashtags,
        },
        ai: { ...current.ai, model: result.model, calls: [...current.ai.calls, record] },
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '发布资产草稿生成失败';
    const config = readAiConfig();
    updateCanonicalProject(projectId, (current) => {
      const record = nextCall(current, {
        purpose: 'production-assets',
        status: 'failed',
        model: config.model,
        promptVersion: config.promptVersion,
        inputHash: createHash('sha256').update(JSON.stringify({ narrative: current.narrative, scenes: current.scenes })).digest('hex'),
        startedAt,
        error: message,
      });
      return { ...current, ai: { ...current.ai, calls: [...current.ai.calls, record] } };
    });
    throw error;
  }
}

export async function produceProjectAutomatically(
  projectId: string,
  instruction = '',
  options: { onStage?: (stage: 'narrative' | 'candidates' | 'assets') => void } = {},
) {
  options.onStage?.('narrative');
  await generateNarrativeDraft(projectId, { instruction, automatic: true });
  applyNarrativeDraft(projectId, true, { automatic: true });
  options.onStage?.('candidates');
  await generateCandidateRecommendations(projectId, { automatic: true, autoSelect: true });
  options.onStage?.('assets');
  return generateProductionAssetDraft(projectId, { automatic: true });
}
