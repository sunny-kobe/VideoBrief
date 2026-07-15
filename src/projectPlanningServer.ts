import { createHash } from 'node:crypto';
import { readAiConfig } from './aiConfig';
import { generateProductionAssets, planNarrative, rankCandidates } from './aiProvider';
import type {
  AiCallRecord,
  NarrativeVersion,
  SceneCandidate,
  ShortVideoProject,
  ShortVideoProjectScene,
  SourceReference,
} from './shortVideoBrief';
import { readBrief, updateCanonicalProject } from './shortVideoProjectServer';
import { researchReviewSummary } from './researchReview';

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
    ...(reference.start == null ? {} : { start: reference.start }),
    ...(reference.end == null ? {} : { end: reference.end }),
    ...(reference.lineStart == null ? {} : { lineStart: reference.lineStart }),
    ...(reference.lineEnd == null ? {} : { lineEnd: reference.lineEnd }),
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
  const review = researchReviewSummary(project);
  if (!review.allSourcesProcessed) throw new Error('还有素材未完成解析。');
  if (!review.keyFacts.length) throw new Error('没有可用于生成脚本的关键内容。');
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
        throw new Error(`${context} returned an invalid time range.`);
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
  rankings: Array<{
    sceneIndex: number;
    sourceId: string;
    sourceStart: number;
    sourceEnd: number;
  }>,
) {
  for (const ranking of rankings) {
    if (ranking.sceneIndex < 0 || ranking.sceneIndex >= project.scenes.length) {
      throw new Error(`Candidate ranking references unknown sceneIndex ${ranking.sceneIndex}.`);
    }
    const source = project.sources.find((item) => item.id === ranking.sourceId);
    if (!source) throw new Error(`Candidate ranking references unknown sourceId ${ranking.sourceId}.`);
    if (source.sourceType !== 'video' && source.sourceType !== 'image') {
      throw new Error(`Candidate ranking source ${source.id} is not visual media.`);
    }
    if (ranking.sourceStart < 0 || ranking.sourceEnd <= ranking.sourceStart) {
      throw new Error(`Candidate ranking for scene ${ranking.sceneIndex} returned an invalid time range.`);
    }
  }
  for (let sceneIndex = 0; sceneIndex < project.scenes.length; sceneIndex += 1) {
    if (!rankings.some((ranking) => ranking.sceneIndex === sceneIndex)) {
      throw new Error(`Candidate ranking omitted sceneIndex ${sceneIndex}.`);
    }
  }
}

function candidatesForScene(
  project: ShortVideoProject,
  references: SourceReference[],
  duration: number,
) {
  const referencedIds = new Set(references.map((reference) => reference.sourceId));
  const visualSources = project.sources.filter(
    (source) => source.sourceType === 'video' || source.sourceType === 'image',
  );
  const prioritized = [
    ...visualSources.filter((source) => referencedIds.has(source.id)),
    ...visualSources.filter((source) => !referencedIds.has(source.id)),
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
    return { candidates: recommendations, selectedCandidateId: '' };
  }
  const selected = scene.candidates.find((candidate) => candidate.id === scene.selectedCandidateId);
  if (!selected) {
    return { candidates: recommendations, selectedCandidateId: '' };
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
  };
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
  if (options.automatic) assertAutomaticProductionReady(project);
  else assertResearchReady(project);
  const startedAt = new Date().toISOString();
  updateCanonicalProject(projectId, (current) => ({
    ...current,
    narrative: { ...current.narrative, status: 'running', error: '' },
  }));

  try {
    const result = await planNarrative(project, (data) => {
      assertProjectReferences(project, data.sourceReferences, 'Narrative plan');
      data.scenes.forEach((scene, index) => {
        assertProjectReferences(project, scene.sourceReferences, `Narrative scene ${index + 1}`);
      });
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
    const scenes = result.data.scenes.map<ShortVideoProjectScene>((scene, index) => {
      const references = scene.sourceReferences.map(referenceFromAi);
      const candidates = candidatesForScene(project, references, sceneDuration);
      return {
        id: `scene-${String(index + 1).padStart(2, '0')}`,
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
        generatedBy: 'ai',
        userEdited: false,
      };
    });
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
      },
      scenes: project.narrative.pendingScenes,
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
    },
  }));
}

export async function generateCandidateRecommendations(
  projectId: string,
  options: { automatic?: boolean; autoSelect?: boolean } = {},
) {
  const project = readBrief(projectId);
  if (options.automatic) assertAutomaticProductionReady(project);
  else assertResearchReady(project);
  if (!project.scenes.length) throw new Error('请先生成或创建场景。');
  const startedAt = new Date().toISOString();
  try {
    const result = await rankCandidates(project, (data) => {
      assertCandidateRankings(project, data.rankings);
    });
    return updateCanonicalProject(projectId, (current) => {
      const scenes = current.scenes.map((scene, sceneIndex) => {
        const ranked = result.data.rankings.filter((item) => item.sceneIndex === sceneIndex);
        const candidates = ranked.flatMap<SceneCandidate>((item, index) => {
          const source = current.sources.find((entry) => entry.id === item.sourceId);
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
        if (options.autoSelect) {
          const selected = candidates[0];
          return {
            ...scene,
            candidates,
            selectedCandidateId: selected.id,
            sourceId: selected.sourceId,
            sourceStart: selected.sourceStart,
            sourceEnd: selected.sourceEnd,
          };
        }
        const preserved = preserveSelectedCandidate(scene, candidates);
        return { ...scene, ...preserved };
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

export async function produceProjectAutomatically(projectId: string, instruction = '') {
  await generateNarrativeDraft(projectId, { instruction, automatic: true });
  applyNarrativeDraft(projectId, true, { automatic: true });
  await generateCandidateRecommendations(projectId, { automatic: true, autoSelect: true });
  return generateProductionAssetDraft(projectId, { automatic: true });
}
