import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, extname, join, resolve } from 'node:path';
import {
  AiCallRecord,
  CreativeBrief,
  DEFAULT_BRIEF_PATH,
  DEFAULT_PROJECT_ID,
  NarrativeVersion,
  ProductionTimeline,
  ProjectProductionRecord,
  ProjectNarrative,
  RenderJobRecord,
  ResearchFact,
  ResearchUncertainty,
  SceneCandidate,
  ShortVideoProject,
  ShortVideoProjectScene,
  ShortVideoOutputs,
  ShortVideoRenderManifest,
  ShortVideoSource,
  SourceAnalysis,
  SourceProcessing,
  SourceReference,
  WorkbenchRenderStatus,
} from './shortVideoBrief';
import {
  AI_PROMPT_VERSION,
  DEFAULT_TRANSCRIPTION_MODEL,
  OPENAI_DEFAULT_MODEL,
} from './aiConfig';
import { researchReviewSummary } from './researchReview';

export const briefPath = resolve(DEFAULT_BRIEF_PATH);
export const projectsRoot = resolve('content/projects');
const defaultWorkDir = resolve('output/videos/local-ffmpeg-synced-work');
export const timelinePath = resolve(defaultWorkDir, 'timeline.json');
export const srtPath = resolve(defaultWorkDir, 'weekly-ai-short-synced.srt');
export const assPath = resolve(defaultWorkDir, 'weekly-ai-short-synced.ass');
export const voiceoverPath = resolve(defaultWorkDir, 'voiceover-synced.aiff');
export const stableTsPath = resolve('output/videos/stable-ts-align/voiceover-stable-ts.srt');

type LegacyProjectInput = Partial<Omit<ShortVideoProject, 'schemaVersion' | 'outputs'>> & {
  schemaVersion?: number;
  outputs?: Partial<ShortVideoOutputs>;
  sourceVideo?: string;
  outputVideo?: string;
  publicRender?: string;
  workDir?: string;
};

export interface CreateProjectInput {
  id: string;
  title: string;
  brief?: Partial<CreativeBrief>;
}

export interface ImportSourceInput {
  label: string;
  originUrl?: string;
  mimeType: string;
  verificationStatus: ShortVideoSource['verificationStatus'];
  rightsStatus: ShortVideoSource['rightsStatus'];
  rightsNote: string;
}

const projectIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertProjectId(projectId: string) {
  if (!projectIdPattern.test(projectId)) throw new Error('项目 ID 只能使用小写字母、数字和连字符。');
  return projectId;
}

export function briefPathFor(projectId = DEFAULT_PROJECT_ID) {
  return join(projectsRoot, assertProjectId(projectId), 'project.json');
}

function numberValue(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeReference(value: Partial<SourceReference>): SourceReference {
  const locatorType = ['time', 'line', 'image', 'file'].includes(value.locatorType ?? '')
    ? value.locatorType!
    : 'file';
  return {
    sourceId: textValue(value.sourceId),
    locatorType,
    ...(Number.isFinite(value.start) ? { start: Number(value.start) } : {}),
    ...(Number.isFinite(value.end) ? { end: Number(value.end) } : {}),
    ...(Number.isFinite(value.lineStart) ? { lineStart: Number(value.lineStart) } : {}),
    ...(Number.isFinite(value.lineEnd) ? { lineEnd: Number(value.lineEnd) } : {}),
    note: textValue(value.note),
  };
}

function clampReviewScore(value: unknown, fallback: number) {
  const score = numberValue(value, fallback);
  return Math.max(0, Math.min(100, score));
}

function legacyFactKind(value: Partial<ResearchFact>, sourceType?: ShortVideoSource['sourceType']): ResearchFact['kind'] {
  if (value.kind === 'claim' || value.kind === 'visual_metadata') return value.kind;
  if (sourceType && !['image', 'video', 'demo'].includes(sourceType)) return 'claim';
  const statement = textValue(value.statement);
  const claimSignal = /(正文|资料|来源|官方|作者).{0,8}(称|表示|指出|写明|说明)|\b(can|supports?|announced|released|requires?)\b|发布|新增|提供|支持|能够|得分|高出|降低|优于|禁止|要求/i;
  const visualSignal = /可见|位于|背景|颜色|矩形|按钮|图标|导航|布局|左侧|右侧|上方|下方|画面|区域/;
  return claimSignal.test(statement) && !visualSignal.test(statement) ? 'claim' : 'visual_metadata';
}

function normalizeFact(
  value: Partial<ResearchFact>,
  index: number,
  sourceType?: ShortVideoSource['sourceType'],
): ResearchFact {
  const reviewStatus = ['proposed', 'confirmed', 'rejected'].includes(value.reviewStatus ?? '')
    ? value.reviewStatus!
    : 'proposed';
  const kind = legacyFactKind(value, sourceType);
  const defaultPriority: ResearchFact['reviewPriority'] = kind === 'visual_metadata'
    ? 'reference'
    : sourceType && !['image', 'video', 'demo'].includes(sourceType)
      ? 'required'
      : 'supporting';
  const reviewPriority = ['required', 'supporting', 'reference'].includes(value.reviewPriority ?? '')
    ? value.reviewPriority!
    : defaultPriority;
  return {
    id: textValue(value.id) || `fact-${String(index + 1).padStart(2, '0')}`,
    statement: textValue(value.statement),
    sourceReferences: Array.isArray(value.sourceReferences)
      ? value.sourceReferences.map(normalizeReference)
      : [],
    reviewStatus,
    kind,
    reviewPriority,
    briefRelevance: clampReviewScore(
      value.briefRelevance,
      reviewPriority === 'required' ? Math.max(55, 95 - index * 4) : reviewPriority === 'supporting' ? 50 : 15,
    ),
  };
}

function normalizeUncertainty(
  value: Partial<ResearchUncertainty>,
  index: number,
  sourceType?: ShortVideoSource['sourceType'],
): ResearchUncertainty {
  const defaultRequired = Boolean(sourceType && !['image', 'video', 'demo'].includes(sourceType));
  const reviewPriority = ['required', 'supporting', 'reference'].includes(value.reviewPriority ?? '')
    ? value.reviewPriority!
    : defaultRequired ? 'required' : 'supporting';
  const riskLevel = ['high', 'medium', 'low'].includes(value.riskLevel ?? '')
    ? value.riskLevel!
    : reviewPriority === 'required' ? 'high' : 'medium';
  return {
    id: textValue(value.id) || `uncertainty-${String(index + 1).padStart(2, '0')}`,
    statement: textValue(value.statement),
    sourceReferences: Array.isArray(value.sourceReferences)
      ? value.sourceReferences.map(normalizeReference)
      : [],
    resolution: textValue(value.resolution),
    riskLevel,
    reviewPriority,
    briefRelevance: clampReviewScore(
      value.briefRelevance,
      reviewPriority === 'required' ? Math.max(60, 95 - index * 5) : 45,
    ),
  };
}

function normalizeProcessing(value?: Partial<SourceProcessing>): SourceProcessing {
  const status = ['idle', 'pending', 'running', 'completed', 'failed'].includes(value?.status ?? '')
    ? value!.status!
    : 'idle';
  const stage = ['idle', 'local-extraction', 'transcription', 'vision', 'fact-extraction', 'completed'].includes(value?.stage ?? '')
    ? value!.stage!
    : 'idle';
  return {
    status,
    stage,
    attempts: Math.max(0, numberValue(value?.attempts, 0)),
    inputHash: textValue(value?.inputHash),
    startedAt: textValue(value?.startedAt),
    completedAt: textValue(value?.completedAt),
    error: textValue(value?.error),
    model: textValue(value?.model),
    promptVersion: textValue(value?.promptVersion),
    cacheHit: value?.cacheHit === true,
  };
}

function normalizeAnalysis(
  value?: Partial<SourceAnalysis>,
  sourceType?: ShortVideoSource['sourceType'],
): SourceAnalysis {
  return {
    extractedText: textValue(value?.extractedText),
    visualDescription: textValue(value?.visualDescription),
    transcript: Array.isArray(value?.transcript)
      ? value.transcript.map((segment, index) => ({
          id: textValue(segment.id) || `segment-${String(index + 1).padStart(2, '0')}`,
          sourceId: textValue(segment.sourceId),
          start: Math.max(0, numberValue(segment.start, 0)),
          end: Math.max(0, numberValue(segment.end, 0)),
          text: textValue(segment.text),
        }))
      : [],
    facts: Array.isArray(value?.facts)
      ? value.facts.map((fact, index) => normalizeFact(fact, index, sourceType))
      : [],
    uncertainties: Array.isArray(value?.uncertainties)
      ? value.uncertainties.map((item, index) => normalizeUncertainty(item, index, sourceType))
      : [],
  };
}

function normalizeSource(source: Partial<ShortVideoSource>, index: number): ShortVideoSource {
  const sourceType = [
    'official',
    'github',
    'paper',
    'demo',
    'social',
    'video',
    'audio',
    'image',
    'markdown',
    'text',
    'news',
  ].includes(source.sourceType ?? '')
    ? source.sourceType!
    : 'video';
  const verificationStatus = ['verified', 'needs_check', 'weak'].includes(
    source.verificationStatus ?? '',
  )
    ? source.verificationStatus!
    : 'needs_check';
  const rightsStatus = ['cleared', 'review_required', 'blocked'].includes(
    source.rightsStatus ?? '',
  )
    ? source.rightsStatus!
    : 'review_required';

  return {
    id: textValue(source.id) || `source-${String(index + 1).padStart(2, '0')}`,
    label: textValue(source.label) || `来源 ${index + 1}`,
    sourceType,
    originUrl: textValue(source.originUrl),
    assetPath: textValue(source.assetPath),
    originalFileName: textValue(source.originalFileName),
    mimeType: textValue(source.mimeType),
    bytes: Math.max(0, numberValue(source.bytes, 0)),
    importedAt: textValue(source.importedAt),
    publishedAt: textValue(source.publishedAt),
    verificationStatus,
    rightsStatus,
    rightsNote: textValue(source.rightsNote),
    contentHash: textValue(source.contentHash) || textValue(source.processing?.inputHash),
    reusedFrom: source.reusedFrom && textValue(source.reusedFrom.projectId) && textValue(source.reusedFrom.sourceId)
      ? { projectId: textValue(source.reusedFrom.projectId), sourceId: textValue(source.reusedFrom.sourceId) }
      : null,
    processing: normalizeProcessing(source.processing),
    analysis: normalizeAnalysis(source.analysis, sourceType),
  };
}

function normalizeProduction(
  value: Partial<ProjectProductionRecord> | undefined,
  sources: ShortVideoSource[],
): ProjectProductionRecord {
  const earliestImport = sources.map((source) => source.importedAt).filter(Boolean).sort()[0] ?? '';
  const trackingStartedAt = textValue(value?.trackingStartedAt) || earliestImport;
  return {
    trackingStartedAt,
    updatedAt: textValue(value?.updatedAt) || trackingStartedAt,
    researchReviewedAt: textValue(value?.researchReviewedAt),
    firstRenderCompletedAt: textValue(value?.firstRenderCompletedAt),
    lastRenderCompletedAt: textValue(value?.lastRenderCompletedAt),
    sourceImportCount: Math.max(sources.length, numberValue(value?.sourceImportCount, sources.length)),
    manualSaveCount: Math.max(0, numberValue(value?.manualSaveCount, 0)),
    renderAttemptCount: Math.max(0, numberValue(value?.renderAttemptCount, 0)),
    renderFailureCount: Math.max(0, numberValue(value?.renderFailureCount, 0)),
    lastRenderStartedAt: textValue(value?.lastRenderStartedAt),
    lastRenderError: textValue(value?.lastRenderError),
    reusedSourceIds: stringArray(value?.reusedSourceIds).filter((sourceId) =>
      sources.some((source) => source.id === sourceId)),
  };
}

function normalizeCandidate(
  candidate: Partial<SceneCandidate>,
  index: number,
): SceneCandidate {
  const mediaType = candidate.mediaType === 'image' ? 'image' : 'video';
  const rightsStatus = ['cleared', 'review_required', 'blocked'].includes(
    candidate.rightsStatus ?? '',
  )
    ? candidate.rightsStatus!
    : 'review_required';
  return {
    id: textValue(candidate.id) || `candidate-${String(index + 1).padStart(2, '0')}`,
    sourceId: textValue(candidate.sourceId),
    assetPath: textValue(candidate.assetPath),
    mediaType,
    sourceStart: Math.max(0, numberValue(candidate.sourceStart, 0)),
    sourceEnd: Math.max(0, numberValue(candidate.sourceEnd, 3)),
    matchReason: textValue(candidate.matchReason),
    rightsStatus,
  };
}

function normalizeScene(
  scene: Partial<ShortVideoProjectScene>,
  index: number,
  defaultSourceId: string,
): ShortVideoProjectScene {
  const sourceStart = Math.max(0, numberValue(scene.sourceStart, 0));
  const sourceEnd = Math.max(sourceStart + 0.5, numberValue(scene.sourceEnd, sourceStart + 3));

  return {
    id: textValue(scene.id) || `scene-${String(index + 1).padStart(2, '0')}`,
    enabled: scene.enabled !== false,
    sourceId: textValue(scene.sourceId) || defaultSourceId,
    sourceStart,
    sourceEnd,
    showEditorialOverlay: scene.showEditorialOverlay !== false,
    eyebrow: textValue(scene.eyebrow),
    title: textValue(scene.title),
    subtitle: textValue(scene.subtitle),
    narration: textValue(scene.narration) || textValue(scene.subtitle),
    visualRequirement: textValue(scene.visualRequirement),
    sourceReferences: Array.isArray(scene.sourceReferences)
      ? scene.sourceReferences.map(normalizeReference)
      : [],
    candidates: Array.isArray(scene.candidates)
      ? scene.candidates.map(normalizeCandidate)
      : [],
    selectedCandidateId: textValue(scene.selectedCandidateId),
    generatedBy: scene.generatedBy === 'ai' ? 'ai' : 'user',
    userEdited: scene.userEdited === true,
  };
}

function normalizeNarrative(value?: Partial<ProjectNarrative>): ProjectNarrative {
  const normalizeVersion = (version: Partial<NarrativeVersion>, index: number): NarrativeVersion => ({
    id: textValue(version.id) || `narrative-${String(index + 1).padStart(2, '0')}`,
    generatedAt: textValue(version.generatedAt),
    model: textValue(version.model),
    promptVersion: textValue(version.promptVersion),
    inputHash: textValue(version.inputHash),
    conclusion: textValue(version.conclusion),
    hook: textValue(version.hook),
    outline: stringArray(version.outline),
    voiceoverScript: textValue(version.voiceoverScript),
    sourceReferences: Array.isArray(version.sourceReferences)
      ? version.sourceReferences.map(normalizeReference)
      : [],
    uncertainties: stringArray(version.uncertainties),
  });
  const status = ['idle', 'pending', 'running', 'completed', 'failed'].includes(value?.status ?? '')
    ? value!.status!
    : 'idle';
  return {
    status,
    error: textValue(value?.error),
    activeVersionId: textValue(value?.activeVersionId),
    versions: Array.isArray(value?.versions) ? value.versions.map(normalizeVersion) : [],
    pendingDraft: value?.pendingDraft ? normalizeVersion(value.pendingDraft, 0) : null,
    pendingScenes: Array.isArray(value?.pendingScenes)
      ? value.pendingScenes.map((scene, index) => normalizeScene(scene, index, textValue(scene.sourceId)))
      : [],
    generatedAt: textValue(value?.generatedAt),
    model: textValue(value?.model),
    promptVersion: textValue(value?.promptVersion),
  };
}

function normalizeAiCall(value: Partial<AiCallRecord>, index: number): AiCallRecord {
  const purposes = ['source-analysis', 'narrative-planning', 'candidate-ranking', 'production-assets'];
  return {
    id: textValue(value.id) || `ai-call-${String(index + 1).padStart(3, '0')}`,
    purpose: purposes.includes(value.purpose ?? '') ? value.purpose! : 'source-analysis',
    status: value.status === 'completed' ? 'completed' : 'failed',
    model: textValue(value.model),
    promptVersion: textValue(value.promptVersion),
    inputHash: textValue(value.inputHash),
    startedAt: textValue(value.startedAt),
    completedAt: textValue(value.completedAt),
    error: textValue(value.error),
    cacheHit: value.cacheHit === true,
  };
}

export function normalizeBrief(input: LegacyProjectInput): ShortVideoProject {
  const projectId = textValue(input.id) || 'codex-app-explainer';
  const legacySourcePath = textValue(input.sourceVideo);
  const hasSources = Array.isArray(input.sources);
  const rawSources = hasSources ? input.sources! : [];
  const sources = (
    hasSources
      ? rawSources
      : [
          {
            id: 'openai-codex-official',
            label: 'OpenAI Codex 官方原片',
            sourceType: 'official' as const,
            assetPath:
              legacySourcePath || 'public/source-clips/openai-codex-app-vertical-30fps.mp4',
          },
        ]
  ).map(normalizeSource);
  const defaultSourceId = sources[0]?.id ?? 'source-01';
  const scenes = Array.isArray(input.scenes) ? input.scenes : [];
  const researchFacts = Array.isArray(input.research?.facts)
    ? input.research.facts.map((fact, index) => {
        const sourceId = fact.sourceReferences?.[0]?.sourceId;
        const sourceType = sources.find((source) => source.id === sourceId)?.sourceType;
        return normalizeFact(fact, index, sourceType);
      })
    : sources.flatMap((source) => source.analysis.facts);
  const researchUncertainties = Array.isArray(input.research?.uncertainties)
    ? input.research.uncertainties.map((item, index) => {
        const sourceId = item.sourceReferences?.[0]?.sourceId;
        const sourceType = sources.find((source) => source.id === sourceId)?.sourceType;
        return normalizeUncertainty(item, index, sourceType);
      })
    : sources.flatMap((source) => source.analysis.uncertainties);
  const researchTranscripts = Array.isArray(input.research?.transcripts)
    ? normalizeAnalysis({ transcript: input.research.transcripts }).transcript
    : sources.flatMap((source) => source.analysis.transcript);

  return {
    schemaVersion: 3,
    id: projectId,
    title: textValue(input.title) || 'OpenAI Codex app 中文短视频样片',
    format: input.format === 'video_project' ? 'video_project' : 'single_signal',
    targetAudience:
      textValue(input.targetAudience) || '中文 AI 实践者 / 开发者 / 独立开发者',
    status:
      input.status === 'review' ||
      input.status === 'ready' ||
      input.status === 'published' ||
      input.status === 'draft'
        ? input.status
        : 'draft',
    technical_status: ['not_rendered', 'stale', 'unverified', 'passed', 'failed'].includes(input.technical_status ?? '')
      ? input.technical_status!
      : 'not_rendered',
    rights_status: ['cleared', 'review_required', 'blocked'].includes(input.rights_status ?? '')
      ? input.rights_status!
      : 'review_required',
    publication_status: ['draft-unpublished', 'ready-for-review', 'published'].includes(input.publication_status ?? '')
      ? input.publication_status!
      : 'draft-unpublished',
    market_status: ['none', 'collecting', 'validated'].includes(input.market_status ?? '')
      ? input.market_status!
      : 'none',
    brief: {
      objective: textValue(input.brief?.objective),
      audience: textValue(input.brief?.audience) || textValue(input.targetAudience),
      platform: textValue(input.brief?.platform) || 'vertical-short-video',
      aspectRatio: ['9:16', '16:9', '1:1'].includes(input.brief?.aspectRatio ?? '')
        ? input.brief!.aspectRatio!
        : '9:16',
      targetDurationSeconds: Math.max(3, numberValue(input.brief?.targetDurationSeconds, 45)),
      tone: textValue(input.brief?.tone),
      style: textValue(input.brief?.style),
      reference: textValue(input.brief?.reference),
      coreMessage: textValue(input.brief?.coreMessage) || textValue(input.editorial?.claim),
      cta: textValue(input.brief?.cta),
      prohibitedMaterial: textValue(input.brief?.prohibitedMaterial),
    },
    sources,
    research: {
      transcripts: researchTranscripts,
      facts: researchFacts,
      uncertainties: researchUncertainties,
    },
    narrative: normalizeNarrative(input.narrative),
    ai: {
      provider: 'openai',
      model: textValue(input.ai?.model) || OPENAI_DEFAULT_MODEL,
      transcriptionModel:
        textValue(input.ai?.transcriptionModel) || DEFAULT_TRANSCRIPTION_MODEL,
      promptVersion: textValue(input.ai?.promptVersion) || AI_PROMPT_VERSION,
      calls: Array.isArray(input.ai?.calls) ? input.ai.calls.map(normalizeAiCall) : [],
    },
    editorial: {
      claim: textValue(input.editorial?.claim),
      whyItMatters: textValue(input.editorial?.whyItMatters),
      chinaContext: textValue(input.editorial?.chinaContext),
      riskNote: textValue(input.editorial?.riskNote),
    },
    platformCopy: {
      coverTitle: textValue(input.platformCopy?.coverTitle),
      title: textValue(input.platformCopy?.title),
      description: textValue(input.platformCopy?.description),
      hashtags: stringArray(input.platformCopy?.hashtags),
    },
    production: normalizeProduction(input.production, sources),
    outputs: {
      outputVideo:
        textValue(input.outputs?.outputVideo) ||
        textValue(input.outputVideo) ||
        `output/videos/${projectId}.mp4`,
      publicRender:
        textValue(input.outputs?.publicRender) ||
        textValue(input.publicRender) ||
        `public/renders/${projectId}.mp4`,
      workDir:
        textValue(input.outputs?.workDir) ||
        textValue(input.workDir) ||
        `output/videos/${projectId}-work`,
      exportDir:
        textValue(input.outputs?.exportDir) || `output/exports/${projectId}`,
      coverImage:
        textValue(input.outputs?.coverImage) || `output/exports/${projectId}/cover.png`,
      platformCopy:
        textValue(input.outputs?.platformCopy) || `output/exports/${projectId}/platform-copy.json`,
      sourceList:
        textValue(input.outputs?.sourceList) || `output/exports/${projectId}/source-list.json`,
      projectSnapshot:
        textValue(input.outputs?.projectSnapshot) || `output/exports/${projectId}/project.snapshot.json`,
    },
    render: {
      width: numberValue(input.render?.width, 1080),
      height: numberValue(input.render?.height, 1920),
      fps: numberValue(input.render?.fps, 30),
      voice: textValue(input.render?.voice) || 'zh-CN-YunxiNeural',
      rate: numberValue(input.render?.rate, 198),
    },
    scenes: scenes.map((scene, index) => normalizeScene(scene, index, defaultSourceId)),
  };
}

export function readBrief(projectId = DEFAULT_PROJECT_ID) {
  return normalizeBrief(JSON.parse(readFileSync(briefPathFor(projectId), 'utf8')) as LegacyProjectInput);
}

export function projectFingerprint(projectId = DEFAULT_PROJECT_ID) {
  return createHash('sha256').update(readFileSync(briefPathFor(projectId))).digest('hex');
}

function aggregateRightsStatus(sources: ShortVideoSource[]) {
  if (sources.some((source) => source.rightsStatus === 'blocked')) return 'blocked' as const;
  if (sources.length > 0 && sources.every((source) => source.rightsStatus === 'cleared')) return 'cleared' as const;
  return 'review_required' as const;
}

function writeProjectFile(projectId: string, project: ShortVideoProject) {
  const targetPath = briefPathFor(projectId);
  mkdirSync(dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(project, null, 2)}\n`);
  renameSync(temporaryPath, targetPath);
  return project;
}

function narrativeInputSnapshot(project: ShortVideoProject) {
  return JSON.stringify({
    brief: project.brief,
    sources: project.sources.map((source) => ({
      id: source.id,
      label: source.label,
      sourceType: source.sourceType,
      verificationStatus: source.verificationStatus,
      rightsStatus: source.rightsStatus,
      rightsNote: source.rightsNote,
      contentHash: source.contentHash,
      processingStatus: source.processing.status,
      processingInputHash: source.processing.inputHash,
      analysis: source.analysis,
    })),
    research: project.research,
  });
}

function invalidatePendingNarrative(current: ShortVideoProject, next: ShortVideoProject) {
  if (!next.narrative.pendingDraft) return next;
  if (narrativeInputSnapshot(current) === narrativeInputSnapshot(next)) return next;
  return {
    ...next,
    narrative: {
      ...next.narrative,
      status: 'idle' as const,
      error: '',
      pendingDraft: null,
      pendingScenes: [],
    },
  };
}

export function updateCanonicalProject(
  projectId: string,
  updater: (project: ShortVideoProject) => ShortVideoProject,
  options: { markRenderStale?: boolean } = {},
) {
  const current = readBrief(projectId);
  let next = normalizeBrief(updater(current));
  if (next.id !== projectId) throw new Error('项目 ID 与保存路径不一致。');
  next = invalidatePendingNarrative(current, next);
  if (options.markRenderStale !== false && current.technical_status !== 'not_rendered') {
    next.technical_status = 'stale';
  }
  next.rights_status = aggregateRightsStatus(next.sources);
  next.production.updatedAt = new Date().toISOString();
  return writeProjectFile(projectId, next);
}

export function writeBrief(
  projectId: string,
  project: ShortVideoProject,
  options: { incrementManualSave?: boolean } = {},
) {
  const current = readBrief(projectId);
  const normalized = normalizeBrief(project);
  if (normalized.id !== projectId) throw new Error('项目 ID 与保存路径不一致。');
  const normalizedSources = new Map(normalized.sources.map((source) => [source.id, source]));
  let next: ShortVideoProject = {
    ...normalized,
    technical_status: current.technical_status === 'not_rendered' ? 'not_rendered' : 'stale',
    outputs: current.outputs,
    render: {
      ...current.render,
      voice: normalized.render.voice,
      rate: normalized.render.rate,
    },
    production: {
      ...current.production,
      updatedAt: new Date().toISOString(),
      manualSaveCount: current.production.manualSaveCount + (options.incrementManualSave === true ? 1 : 0),
    },
    sources: current.sources.map((source) => ({
      ...source,
      ...normalizedSources.get(source.id),
      id: source.id,
      assetPath: source.assetPath,
    })),
  };
  next.research = {
    transcripts: next.sources.flatMap((source) => source.analysis.transcript),
    facts: next.sources.flatMap((source) => source.analysis.facts),
    uncertainties: next.sources.flatMap((source) => source.analysis.uncertainties),
  };
  const researchReviewed = researchReviewSummary(next).ready;
  if (researchReviewed && !next.production.researchReviewedAt) {
    next.production.researchReviewedAt = new Date().toISOString();
  }
  next = invalidatePendingNarrative(current, next);
  next.rights_status = aggregateRightsStatus(next.sources);
  return writeProjectFile(projectId, next);
}

export function createProject(input: CreateProjectInput) {
  const projectId = assertProjectId(input.id);
  const targetPath = briefPathFor(projectId);
  if (existsSync(targetPath)) throw new Error('该项目 ID 已存在。');
  const title = textValue(input.title).trim();
  if (!title) throw new Error('项目标题不能为空。');
  const briefInput = input.brief ?? {};
  const objective = textValue(briefInput.objective).trim();
  const audience = textValue(briefInput.audience).trim();
  const coreMessage = textValue(briefInput.coreMessage).trim();
  if (!objective || !audience || !coreMessage) {
    throw new Error('视频目标、主要受众和核心观点不能为空。');
  }
  const aspectRatio = ['9:16', '16:9', '1:1'].includes(briefInput.aspectRatio ?? '')
    ? briefInput.aspectRatio
    : '9:16';
  const renderSize = aspectRatio === '16:9'
    ? { width: 1920, height: 1080 }
    : aspectRatio === '1:1'
      ? { width: 1080, height: 1080 }
      : { width: 1080, height: 1920 };
  const createdAt = new Date().toISOString();
  const project = normalizeBrief({
    schemaVersion: 3,
    id: projectId,
    title,
    format: 'video_project',
    targetAudience: audience,
    status: 'draft',
    technical_status: 'not_rendered',
    rights_status: 'review_required',
    publication_status: 'draft-unpublished',
    market_status: 'none',
    production: {
      trackingStartedAt: createdAt,
      updatedAt: createdAt,
      researchReviewedAt: '',
      firstRenderCompletedAt: '',
      lastRenderCompletedAt: '',
      sourceImportCount: 0,
      manualSaveCount: 0,
      renderAttemptCount: 0,
      renderFailureCount: 0,
      lastRenderStartedAt: '',
      lastRenderError: '',
      reusedSourceIds: [],
    },
    brief: { ...briefInput, objective, audience, coreMessage, aspectRatio } as CreativeBrief,
    sources: [],
    scenes: [],
    editorial: {
      claim: coreMessage,
      whyItMatters: '',
      chinaContext: '',
      riskNote: '',
    },
    outputs: {
      outputVideo: `output/videos/${projectId}.mp4`,
      publicRender: `public/renders/${projectId}.mp4`,
      workDir: `output/videos/${projectId}-work`,
    },
    render: { ...renderSize, fps: 30, voice: 'zh-CN-YunxiNeural', rate: 198 },
  });
  return writeProjectFile(projectId, project);
}

export function listProjects() {
  if (!existsSync(projectsRoot)) return [];
  return readdirSync(projectsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && projectIdPattern.test(entry.name) && existsSync(briefPathFor(entry.name)))
    .map((entry) => readBrief(entry.name))
    .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
}

function safeFileName(fileName: string) {
  const extension = extname(fileName).toLowerCase();
  if (!['.mp4', '.mov', '.m4v', '.webm', '.mp3', '.wav', '.m4a', '.aiff', '.aac', '.png', '.jpg', '.jpeg', '.webp', '.md', '.txt'].includes(extension)) {
    throw new Error('支持 MP4/MOV/WebM、MP3/WAV/M4A、PNG/JPEG/WebP、Markdown 和纯文本。');
  }
  const stem = basename(fileName, extension)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'video';
  return `${stem}-${Date.now()}${extension}`;
}

function sourceTypeForFile(fileName: string) {
  const extension = extname(fileName).toLowerCase();
  if (['.mp4', '.mov', '.m4v', '.webm'].includes(extension)) return 'video' as const;
  if (['.mp3', '.wav', '.m4a', '.aiff', '.aac'].includes(extension)) return 'audio' as const;
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) return 'image' as const;
  if (extension === '.md') return 'markdown' as const;
  return 'text' as const;
}

function findReusableSource(contentHash: string, currentProjectId: string, importedBefore: string) {
  if (!contentHash || !importedBefore) return null;
  const reusableSources = listProjects()
    .filter((project) => project.id !== currentProjectId)
    .flatMap((project) => project.sources.map((source) => ({ projectId: project.id, source })))
    .filter(({ source }) => (
      source.contentHash === contentHash &&
      Boolean(source.importedAt) &&
      source.importedAt < importedBefore
    ))
    .sort((left, right) => left.source.importedAt.localeCompare(right.source.importedAt));
  const reusable = reusableSources[0];
  return reusable ? { projectId: reusable.projectId, sourceId: reusable.source.id } : null;
}

export function importProjectSource(projectId: string, fileName: string, bytes: Uint8Array, input: ImportSourceInput) {
  const project = readBrief(projectId);
  if (bytes.byteLength === 0) throw new Error('上传文件为空。');
  if (!textValue(input.rightsNote).trim()) throw new Error('必须填写权利与来源说明。');
  const storedName = safeFileName(fileName);
  const sourceType = sourceTypeForFile(fileName);
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  const importedAt = new Date().toISOString();
  const reusedFrom = findReusableSource(contentHash, projectId, importedAt);
  const assetDirectory = resolve('public/project-assets', projectId);
  mkdirSync(assetDirectory, { recursive: true });
  const absoluteAssetPath = join(assetDirectory, storedName);
  writeFileSync(absoluteAssetPath, bytes);
  const id = `source-${String(project.sources.length + 1).padStart(2, '0')}`;
  const source: ShortVideoSource = {
    id,
    label: textValue(input.label).trim() || fileName,
    sourceType,
    originUrl: textValue(input.originUrl),
    assetPath: `public/project-assets/${projectId}/${storedName}`,
    originalFileName: fileName,
    mimeType: textValue(input.mimeType),
    bytes: bytes.byteLength,
    importedAt,
    publishedAt: '',
    verificationStatus: input.verificationStatus,
    rightsStatus: input.rightsStatus,
    rightsNote: textValue(input.rightsNote),
    contentHash,
    reusedFrom,
    processing: normalizeProcessing(),
    analysis: normalizeAnalysis(),
  };
  const canSeedVisualScene = sourceType === 'video' || sourceType === 'image';
  const scenes = project.scenes.length || !canSeedVisualScene ? project.scenes : [normalizeScene({
    id: 'scene-01',
    enabled: true,
    sourceId: id,
    sourceStart: 0,
    sourceEnd: 3,
    eyebrow: project.brief.platform.toUpperCase(),
    title: project.brief.coreMessage || project.title,
    subtitle: project.brief.coreMessage || project.brief.objective || project.title,
    narration: project.brief.coreMessage || project.brief.objective || project.title,
    visualRequirement: `使用 ${source.label} 展示项目主题`,
    sourceReferences: [{ sourceId: id, locatorType: sourceType === 'video' ? 'time' : 'image', note: '导入素材' }],
    candidates: [{
      id: 'candidate-01',
      sourceId: id,
      assetPath: source.assetPath,
      mediaType: sourceType,
      sourceStart: 0,
      sourceEnd: 3,
      matchReason: '首个可视素材，等待用户确认或 AI 候选排序。',
      rightsStatus: source.rightsStatus,
    }],
    selectedCandidateId: 'candidate-01',
  }, 0, id)];
  const next: ShortVideoProject = {
    ...project,
    technical_status: project.technical_status === 'not_rendered' ? 'not_rendered' : 'stale',
    rights_status: aggregateRightsStatus([...project.sources, source]),
    production: {
      ...project.production,
      updatedAt: new Date().toISOString(),
      sourceImportCount: project.production.sourceImportCount + 1,
      reusedSourceIds: reusedFrom
        ? [...new Set([...project.production.reusedSourceIds, id])]
        : project.production.reusedSourceIds,
    },
    sources: [...project.sources, source],
    scenes,
  };
  writeProjectFile(projectId, next);
  return { project: next, source };
}

export function recordRenderAttempt(projectId: string) {
  const startedAt = new Date().toISOString();
  return updateCanonicalProject(projectId, (project) => {
    const sources = project.sources.map((source) => {
      if (!source.contentHash) return source;
      return {
        ...source,
        reusedFrom: findReusableSource(source.contentHash, projectId, source.importedAt),
      };
    });
    const reusedSourceIds = sources.filter((source) => source.reusedFrom).map((source) => source.id);
    return {
      ...project,
      sources,
      production: {
        ...project.production,
        renderAttemptCount: project.production.renderAttemptCount + 1,
        lastRenderStartedAt: startedAt,
        lastRenderError: '',
        reusedSourceIds,
      },
    };
  });
}

export function recordRenderFailure(projectId: string, error: string) {
  return updateCanonicalProject(projectId, (project) => ({
    ...project,
    technical_status: 'failed',
    production: {
      ...project.production,
      renderFailureCount: project.production.renderFailureCount + 1,
      lastRenderError: error,
    },
  }), { markRenderStale: false });
}

export function publicHref(path: string) {
  if (!path.startsWith('public/')) return undefined;
  return `/${path.replace(/^public\//, '')}`;
}

export function projectPaths(project: ShortVideoProject) {
  const workDir = resolve(project.outputs.workDir);
  const sources = project.sources.map((source) => ({
    ...source,
    path: resolve(source.assetPath),
    href: publicHref(source.assetPath),
  }));
  const primarySource = sources[0];

  return {
    briefPath: briefPathFor(project.id),
    sources,
    sourceVideoPath: primarySource?.path ?? '',
    sourceVideoHref: primarySource?.href ?? '',
    outputVideoPath: resolve(project.outputs.outputVideo),
    publicRenderPath: resolve(project.outputs.publicRender),
    publicRenderHref: publicHref(project.outputs.publicRender) ?? '',
    exportDir: resolve(project.outputs.exportDir),
    exportZipPath: resolve(`${project.outputs.exportDir}.zip`),
    coverImagePath: resolve(project.outputs.coverImage),
    platformCopyPath: resolve(project.outputs.platformCopy),
    sourceListPath: resolve(project.outputs.sourceList),
    projectSnapshotPath: resolve(project.outputs.projectSnapshot),
    exportManifestPath: resolve(project.outputs.exportDir, 'export-manifest.json'),
    timelinePath: join(workDir, 'timeline.json'),
    manifestPath: join(workDir, 'render-manifest.json'),
    renderJobPath: join(workDir, 'render-job.json'),
    srtPath: join(workDir, 'weekly-ai-short-synced.srt'),
    assPath: join(workDir, 'weekly-ai-short-synced.ass'),
    voiceoverPath: join(workDir, 'voiceover-synced.aiff'),
    stableTsPath,
  };
}

export function readTimeline(path = timelinePath): ProductionTimeline {
  if (!existsSync(path)) return { duration: 0, scenes: [] };
  return JSON.parse(readFileSync(path, 'utf8')) as ProductionTimeline;
}

export function readRenderManifest(path: string): ShortVideoRenderManifest | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as ShortVideoRenderManifest;
}

export function readRenderJob(path: string): RenderJobRecord | null {
  if (!existsSync(path)) return null;
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<RenderJobRecord>;
  if (
    value.schemaVersion !== 1 ||
    typeof value.projectId !== 'string' ||
    !['running', 'completed', 'failed'].includes(value.state ?? '') ||
    !['saving', 'rendering', 'proof', 'packaging', 'completed'].includes(value.stage ?? '')
  ) return null;
  return value as RenderJobRecord;
}

export function writeRenderJob(path: string, job: RenderJobRecord) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(job, null, 2)}\n`);
  renameSync(temporaryPath, path);
  return job;
}

export function renderStatus(
  manifest: ShortVideoRenderManifest | null,
  projectId = manifest?.projectId ?? DEFAULT_PROJECT_ID,
): WorkbenchRenderStatus {
  if (!manifest) {
    return {
      state: 'missing',
      label: '尚未渲染',
      message: '保存分镜后运行生产渲染，才会生成可验收成片。',
    };
  }
  if (
    resolve(manifest.briefPath) !== briefPathFor(projectId) ||
    manifest.projectFingerprint !== projectFingerprint(projectId)
  ) {
    return {
      state: 'stale',
      label: '成片已过期',
      message: '项目文件已修改，当前 MP4 不再对应最新分镜。',
      renderedAt: manifest.renderedAt,
      duration: manifest.render.duration,
    };
  }
  if (!manifest.proof?.passed) {
    return {
      state: 'unverified',
      label: '等待验收',
      message: '成片已生成，但尚未通过当前项目的画面、音轨和产物检查。',
      renderedAt: manifest.renderedAt,
      duration: manifest.render.duration,
    };
  }
  const artifactsExist = Object.values(manifest.artifacts).every(
    (path) => path == null || (existsSync(path) && statSync(path).size > 0),
  );
  if (!artifactsExist) {
    return {
      state: 'unverified',
      label: '成片产物缺失',
      message: 'manifest 中至少有一个 MP4、字幕、配音或时间轴产物不存在。',
      renderedAt: manifest.renderedAt,
      duration: manifest.render.duration,
    };
  }
  return {
    state: 'ready',
    label: '成片已验收',
    message: 'MP4、音轨、字幕、时间轴和抽帧均通过当前项目检查。',
    renderedAt: manifest.renderedAt,
    duration: manifest.render.duration,
  };
}

export function readText(path: string) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

export function fileSize(path: string) {
  if (!existsSync(path)) return 'missing';
  const bytes = statSync(path).size;
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
