import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
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
  PublicationCopySnapshot,
  PublicationMetricSnapshot,
  PublicationTarget,
  ProjectMaterialReview,
  ProjectMaterialQualityReview,
  ProjectWorkflow,
  ProjectWorkflowOrigin,
  ProjectChapter,
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
  SourceAnalysisChapter,
  SourceProcessing,
  SourceReference,
  WorkbenchRenderStatus,
  WorkflowApproval,
  WorkflowHumanDecision,
} from './shortVideoBrief';
import { assertProjectTargetDuration } from '../scripts/lib/video-duration-contract.mjs';
import {
  AI_PROMPT_VERSION,
  DEFAULT_TRANSCRIPTION_MODEL,
  OPENAI_DEFAULT_MODEL,
} from './aiConfig';
import { materialReviewReadiness, sceneSelectionReadiness } from './productionReadiness';
import { renderAcceptanceState } from './renderAcceptance';
import { researchReviewSummary } from './researchReview';
import {
  exportPackageReadiness,
  fileSha256,
  readExportPackageReceipt,
} from './exportPackage';
import { DEFAULT_NEW_PROJECT_VOICE } from './voiceProfile';
import {
  packageContentFingerprint,
  productionContentFingerprint,
} from '../scripts/lib/production-content-fingerprint.mjs';
import {
  approvalIsCurrent,
  normalizeHumanWorkflowDecision,
  topicApprovalFingerprint,
} from '../scripts/lib/production-workflow-contract.mjs';
import { resolveProjectRendition, resolveProjectRenditions } from '../scripts/lib/video-renditions.mjs';
import { withJsonFileLock, writeAtomicJson } from './persistentJsonQueue';

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
  workflowOrigin?: Partial<ProjectWorkflowOrigin>;
  topicApproval?: WorkflowHumanDecision;
}

export interface ImportSourceInput {
  label: string;
  originUrl?: string;
  mimeType: string;
  materialRole?: ShortVideoSource['materialRole'];
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
  const stage = ['idle', 'local-extraction', 'transcription', 'vision', 'fact-extraction', 'hierarchy', 'completed'].includes(value?.stage ?? '')
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
    ...(value?.chapterProgress ? {
      chapterProgress: {
        completed: Math.max(0, numberValue(value.chapterProgress.completed, 0)),
        total: Math.max(0, numberValue(value.chapterProgress.total, 0)),
      },
    } : {}),
  };
}

function normalizeAnalysis(
  value?: Partial<SourceAnalysis>,
  sourceType?: ShortVideoSource['sourceType'],
): SourceAnalysis {
  return {
    extractedText: textValue(value?.extractedText),
    visualDescription: textValue(value?.visualDescription),
    hierarchicalSummary: textValue(value?.hierarchicalSummary),
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
    chapters: Array.isArray(value?.chapters)
      ? value.chapters.map((chapter, index) => normalizeSourceChapter(chapter, index, sourceType))
      : [],
  };
}

function normalizeSourceChapter(
  value: Partial<SourceAnalysisChapter>,
  index: number,
  sourceType?: ShortVideoSource['sourceType'],
): SourceAnalysisChapter {
  const start = Math.max(0, numberValue(value.start, 0));
  const end = Math.max(start, numberValue(value.end, start));
  return {
    id: textValue(value.id) || `chapter-${String(index + 1).padStart(2, '0')}`,
    sourceId: textValue(value.sourceId),
    index: Math.max(0, numberValue(value.index, index)),
    start,
    end,
    title: textValue(value.title) || `章节 ${index + 1}`,
    summary: textValue(value.summary),
    visualDescription: textValue(value.visualDescription),
    frameSamples: Array.isArray(value.frameSamples)
      ? value.frameSamples.flatMap((frame) => {
          const second = numberValue(frame?.second, -1);
          if (second < start || second > end) return [];
          return [{
            second,
            reason: frame?.reason === 'scene-change' ? 'scene-change' as const : 'coverage' as const,
          }];
        })
      : [],
    transcript: Array.isArray(value.transcript)
      ? value.transcript.map((segment, segmentIndex) => ({
          id: textValue(segment.id) || `${textValue(value.id) || `chapter-${index + 1}`}-segment-${segmentIndex + 1}`,
          sourceId: textValue(segment.sourceId) || textValue(value.sourceId),
          start: Math.max(start, numberValue(segment.start, start)),
          end: Math.min(end, Math.max(start, numberValue(segment.end, start))),
          text: textValue(segment.text),
        }))
      : [],
    facts: Array.isArray(value.facts)
      ? value.facts.map((fact, factIndex) => normalizeFact(fact, factIndex, sourceType))
      : [],
    uncertainties: Array.isArray(value.uncertainties)
      ? value.uncertainties.map((item, itemIndex) => normalizeUncertainty(item, itemIndex, sourceType))
      : [],
    processing: {
      status: value.processing?.status === 'completed'
        ? 'completed'
        : value.processing?.status === 'failed'
          ? 'failed'
          : 'pending',
      inputHash: textValue(value.processing?.inputHash),
      model: textValue(value.processing?.model),
      promptVersion: textValue(value.processing?.promptVersion),
      cacheHit: value.processing?.cacheHit === true,
      error: textValue(value.processing?.error),
      ...(textValue(value.processing?.resumeKey) ? { resumeKey: textValue(value.processing?.resumeKey) } : {}),
    },
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
  const materialRole = ['official_demo', 'broll', 'evidence', 'research'].includes(source.materialRole ?? '')
    ? source.materialRole!
    : sourceType !== 'video' && sourceType !== 'image'
      ? 'research'
      : /截图|screenshot|capture/i.test(`${source.label ?? ''} ${source.originalFileName ?? ''}`)
        ? 'evidence'
        : 'official_demo';

  return {
    id: textValue(source.id) || `source-${String(index + 1).padStart(2, '0')}`,
    label: textValue(source.label) || `来源 ${index + 1}`,
    sourceType,
    materialRole,
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

function normalizeMaterialReview(
  value: Partial<ProjectMaterialReview> | undefined,
  sources: ShortVideoSource[],
): ProjectMaterialReview {
  const approvedSourceIds = stringArray(value?.approvedSourceIds).filter((sourceId) => {
    const source = sources.find((item) => item.id === sourceId);
    return source
      && (source.sourceType === 'video' || source.sourceType === 'image')
      && source.materialRole !== 'research'
      && source.rightsStatus !== 'blocked';
  });
  const reviewedAt = textValue(value?.reviewedAt);
  const hasVisual = approvedSourceIds.some((sourceId) => {
    const sourceType = sources.find((source) => source.id === sourceId)?.sourceType;
    return sourceType === 'video' || sourceType === 'image';
  });
  return {
    status: value?.status === 'approved' && reviewedAt && hasVisual ? 'approved' : 'pending',
    approvedSourceIds,
    reviewedAt: value?.status === 'approved' && hasVisual ? reviewedAt : '',
  };
}

function normalizeWorkflowApproval(value: Partial<WorkflowApproval> | undefined): WorkflowApproval {
  const status = ['pending', 'approved', 'rejected'].includes(value?.status ?? '')
    ? value!.status!
    : 'pending';
  return {
    status,
    decidedAt: status === 'pending' ? '' : textValue(value?.decidedAt),
    decidedBy: status === 'pending' ? '' : textValue(value?.decidedBy),
    note: status === 'pending' ? '' : textValue(value?.note),
    fingerprint: status === 'pending' ? '' : textValue(value?.fingerprint),
  };
}

function normalizePublicationTarget(
  value: Partial<PublicationTarget>,
  index: number,
): PublicationTarget {
  const approval = normalizeWorkflowApproval(value.approval);
  const publishedAt = textValue(value.publishedAt);
  const scheduledAt = textValue(value.scheduledAt);
  const status = [
    'pending', 'approved', 'uploading', 'submitted', 'scheduled', 'published', 'failed', 'rejected',
  ].includes(value.status ?? '')
    ? value.status!
    : publishedAt
      ? 'published'
      : scheduledAt
        ? 'scheduled'
        : approval.status === 'rejected'
          ? 'rejected'
          : approval.status === 'approved'
            ? 'approved'
            : 'pending';
  const copySnapshotValue = value.copySnapshot as Partial<PublicationCopySnapshot> | null | undefined;
  const copySnapshot = copySnapshotValue && typeof copySnapshotValue === 'object'
    ? {
        title: textValue(copySnapshotValue.title),
        description: textValue(copySnapshotValue.description),
        hashtags: stringArray(copySnapshotValue.hashtags),
        generatedByAi: copySnapshotValue.generatedByAi === true,
        effectiveTitle: textValue(copySnapshotValue.effectiveTitle),
        effectiveDescription: textValue(copySnapshotValue.effectiveDescription),
        capturedAt: textValue(copySnapshotValue.capturedAt),
        source: textValue(copySnapshotValue.source),
      }
    : null;
  const metricSnapshots = Array.isArray(value.metricSnapshots)
    ? value.metricSnapshots.map((snapshot) => {
        const item = snapshot as Partial<PublicationMetricSnapshot>;
        const optionalMetric = (metric: unknown) => Number.isFinite(metric) ? Number(metric) : null;
        return {
          observedAt: textValue(item.observedAt),
          source: textValue(item.source),
          viewCount: optionalMetric(item.viewCount),
          likeCount: optionalMetric(item.likeCount),
          commentCount: optionalMetric(item.commentCount),
          shareCount: optionalMetric(item.shareCount),
          favoriteCount: optionalMetric(item.favoriteCount),
          coinCount: optionalMetric(item.coinCount),
          danmakuCount: optionalMetric(item.danmakuCount),
          followerGain: optionalMetric(item.followerGain),
          completionRate: optionalMetric(item.completionRate),
          averageWatchSeconds: optionalMetric(item.averageWatchSeconds),
          twoSecondBounceRate: optionalMetric(item.twoSecondBounceRate),
          note: textValue(item.note),
        };
      })
    : [];
  return {
    id: textValue(value.id) || `publication-target-${String(index + 1).padStart(3, '0')}`,
    platform: textValue(value.platform),
    status,
    approval,
    scheduledAt: status === 'scheduled' || status === 'published' ? scheduledAt : '',
    submittedAt: textValue(value.submittedAt),
    submissionUrl: textValue(value.submissionUrl),
    publishedUrl: status === 'published' ? textValue(value.publishedUrl) : '',
    publishedAt: status === 'published' ? publishedAt : '',
    externalId: textValue(value.externalId),
    videoSha256: textValue(value.videoSha256),
    packageSha256: textValue(value.packageSha256),
    publisher: textValue(value.publisher),
    accountName: textValue(value.accountName),
    lastRunId: textValue(value.lastRunId),
    lastRunAt: textValue(value.lastRunAt),
    lastError: textValue(value.lastError),
    note: textValue(value.note),
    copySnapshot,
    metricSnapshots,
  };
}

function normalizeWorkflow(value: Partial<ProjectWorkflow> | undefined): ProjectWorkflow {
  const originKind = ['manual', 'daily_signal', 'legacy'].includes(value?.origin?.kind ?? '')
    ? value!.origin!.kind!
    : 'legacy';
  const marketDecision = ['pending', 'validated', 'not_validated', 'inconclusive'].includes(
    value?.market?.decision ?? '',
  ) ? value!.market!.decision! : 'pending';
  const publication = {
    approval: normalizeWorkflowApproval(value?.publication?.approval),
    platform: textValue(value?.publication?.platform),
    publishedUrl: textValue(value?.publication?.publishedUrl),
    publishedAt: textValue(value?.publication?.publishedAt),
    videoSha256: textValue(value?.publication?.videoSha256),
    packageSha256: textValue(value?.publication?.packageSha256),
  };
  const publicationTargets = Array.isArray(value?.publicationTargets)
    ? value.publicationTargets.map(normalizePublicationTarget)
    : [];
  if (
    publicationTargets.length === 0
    && (publication.platform || publication.publishedUrl || publication.approval.status !== 'pending')
  ) {
    publicationTargets.push(normalizePublicationTarget({
      id: 'primary',
      platform: publication.platform,
      status: publication.publishedUrl
        ? 'published'
        : publication.approval.status === 'rejected'
          ? 'rejected'
          : publication.approval.status === 'approved'
            ? 'approved'
            : 'pending',
      approval: publication.approval,
      publishedUrl: publication.publishedUrl,
      publishedAt: publication.publishedAt,
      videoSha256: publication.videoSha256,
      packageSha256: publication.packageSha256,
    }, 0));
  }
  return {
    schemaVersion: 1,
    origin: {
      kind: originKind,
      runId: textValue(value?.origin?.runId),
      candidateId: textValue(value?.origin?.candidateId),
      sourceUrl: textValue(value?.origin?.sourceUrl),
      score: Number.isFinite(value?.origin?.score) ? Number(value?.origin?.score) : null,
      summary: textValue(value?.origin?.summary),
    },
    topicApproval: normalizeWorkflowApproval(value?.topicApproval),
    researchApproval: normalizeWorkflowApproval(value?.researchApproval),
    deliveryApproval: normalizeWorkflowApproval(value?.deliveryApproval),
    publication,
    publicationTargets,
    market: {
      decision: marketDecision,
      decidedAt: marketDecision === 'pending' ? '' : textValue(value?.market?.decidedAt),
      decidedBy: marketDecision === 'pending' ? '' : textValue(value?.market?.decidedBy),
      note: marketDecision === 'pending' ? '' : textValue(value?.market?.note),
      evidence: Array.isArray(value?.market?.evidence)
        ? value.market.evidence.map((item, index) => ({
            id: textValue(item.id) || `market-evidence-${String(index + 1).padStart(3, '0')}`,
            recordedAt: textValue(item.recordedAt),
            source: textValue(item.source),
            sourceUrl: textValue(item.sourceUrl),
            metric: textValue(item.metric),
            value: numberValue(item.value, 0),
            unit: textValue(item.unit),
            periodStart: textValue(item.periodStart),
            periodEnd: textValue(item.periodEnd),
            note: textValue(item.note),
          }))
        : [],
    },
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

function normalizeMaterialQualityReview(
  value?: Partial<ProjectMaterialQualityReview>,
): ProjectMaterialQualityReview | undefined {
  if (!value) return undefined;
  const statuses = ['pending', 'passed', 'failed'];
  return {
    schemaVersion: 1,
    status: statuses.includes(value.status ?? '') ? value.status! : 'pending',
    reviewedAt: textValue(value.reviewedAt),
    reviewer: textValue(value.reviewer),
    reviewScope: textValue(value.reviewScope),
    sceneReviews: Array.isArray(value.sceneReviews)
      ? value.sceneReviews.map((review) => ({
          sceneId: textValue(review.sceneId),
          sceneFingerprint: textValue(review.sceneFingerprint),
          candidate: {
            sourceId: textValue(review.candidate?.sourceId),
            sourceStart: Math.max(0, numberValue(review.candidate?.sourceStart, 0)),
            sourceEnd: Math.max(0, numberValue(review.candidate?.sourceEnd, 0)),
          },
          visibleClaim: textValue(review.visibleClaim),
          evidenceRole: ['primary-evidence', 'operation-demo', 'source-establishing', 'transition', 'background'].includes(review.evidenceRole ?? '')
            ? review.evidenceRole!
            : 'primary-evidence',
          narrationMatch: {
            score: Math.max(0, Math.min(3, numberValue(review.narrationMatch?.score, 0))),
            reason: textValue(review.narrationMatch?.reason),
          },
          readability: {
            desktop: ['passed', 'failed', 'not-applicable'].includes(review.readability?.desktop ?? '')
              ? review.readability!.desktop
              : 'failed',
            mobile: ['passed', 'failed', 'not-applicable'].includes(review.readability?.mobile ?? '')
              ? review.readability!.mobile
              : 'failed',
            criticalText: stringArray(review.readability?.criticalText),
            reason: textValue(review.readability?.reason),
          },
          temporalCompleteness: {
            status: ['passed', 'failed', 'not-applicable'].includes(review.temporalCompleteness?.status ?? '')
              ? review.temporalCompleteness!.status
              : 'failed',
            reason: textValue(review.temporalCompleteness?.reason),
          },
          stability: {
            status: ['stable', 'minor-motion', 'unstable'].includes(review.stability?.status ?? '')
              ? review.stability!.status
              : 'unstable',
            motionNecessary: review.stability?.motionNecessary === true,
            reason: textValue(review.stability?.reason),
          },
          uniqueness: {
            status: ['unique', 'duplicate', 'background-reuse'].includes(review.uniqueness?.status ?? '')
              ? review.uniqueness!.status
              : 'duplicate',
            reason: textValue(review.uniqueness?.reason),
          },
          platformWatermark: {
            status: ['absent', 'present', 'not-applicable', 'not-reviewed'].includes(review.platformWatermark?.status ?? '')
              ? review.platformWatermark!.status
              : 'not-reviewed',
            marks: stringArray(review.platformWatermark?.marks),
            reason: textValue(review.platformWatermark?.reason),
          },
          decision: ['accept', 'reject', 'needs-review'].includes(review.decision ?? '')
            ? review.decision!
            : 'needs-review',
          decisionReasons: stringArray(review.decisionReasons),
          evidence: stringArray(review.evidence),
        }))
      : [],
  };
}

function normalizeScene(
  scene: Partial<ShortVideoProjectScene>,
  index: number,
  defaultSourceId: string,
): ShortVideoProjectScene {
  const sourceStart = Math.max(0, numberValue(scene.sourceStart, 0));
  const sourceEnd = Math.max(sourceStart + 0.5, numberValue(scene.sourceEnd, sourceStart + 3));
  const selectedCandidateId = textValue(scene.selectedCandidateId);
  const inferredSelectionStatus = selectedCandidateId
    ? scene.generatedBy === 'user'
      ? 'user_approved'
      : scene.userEdited === true
        ? 'codex_reviewed'
        : 'ai_suggested'
    : 'unselected';
  const selectionStatus = [
    'unselected',
    'ai_suggested',
    'codex_reviewed',
    'user_approved',
  ].includes(scene.selectionStatus ?? '')
    ? scene.selectionStatus!
    : inferredSelectionStatus;
  const mediaFocalX = Number(scene.mediaFocalX);
  const mediaFocalY = Number(scene.mediaFocalY);
  const mediaPlaybackRate = Number(scene.mediaPlaybackRate);
  const mediaMotionAmount = Number(scene.mediaMotionAmount);
  const subtitleBottom = Number(scene.subtitleBottom);

  return {
    id: textValue(scene.id) || `scene-${String(index + 1).padStart(2, '0')}`,
    chapterId: textValue(scene.chapterId),
    enabled: scene.enabled !== false,
    sourceId: textValue(scene.sourceId) || defaultSourceId,
    sourceStart,
    sourceEnd,
    ...(['contain', 'cover'].includes(scene.mediaFit ?? '') ? { mediaFit: scene.mediaFit! } : {}),
    ...(Number.isFinite(mediaFocalX) ? { mediaFocalX: Math.max(0, Math.min(1, mediaFocalX)) } : {}),
    ...(Number.isFinite(mediaFocalY) ? { mediaFocalY: Math.max(0, Math.min(1, mediaFocalY)) } : {}),
    ...(Number.isFinite(mediaPlaybackRate)
      ? { mediaPlaybackRate: Math.max(0.25, Math.min(4, mediaPlaybackRate)) }
      : {}),
    ...(['none', 'push-in', 'pull-out'].includes(scene.mediaMotion ?? '')
      ? { mediaMotion: scene.mediaMotion! }
      : {}),
    ...(Number.isFinite(mediaMotionAmount)
      ? { mediaMotionAmount: Math.max(0.02, Math.min(0.12, mediaMotionAmount)) }
      : {}),
    ...(Number.isFinite(subtitleBottom) && subtitleBottom > 0
      ? { subtitleBottom }
      : {}),
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
    selectedCandidateId,
    selectionStatus: selectedCandidateId ? selectionStatus : 'unselected',
    selectionReviewedAt: textValue(scene.selectionReviewedAt),
    selectionNote: textValue(scene.selectionNote),
    generatedBy: scene.generatedBy === 'ai' ? 'ai' : 'user',
    userEdited: scene.userEdited === true,
  };
}

function normalizeProjectChapter(
  value: Partial<ProjectChapter>,
  index: number,
  sceneIds: Set<string>,
): ProjectChapter {
  const targetDurationSeconds = Number(value.targetDurationSeconds);
  return {
    id: textValue(value.id) || `chapter-${String(index + 1).padStart(2, '0')}`,
    title: textValue(value.title) || `章节 ${index + 1}`,
    summary: textValue(value.summary),
    order: Math.max(0, numberValue(value.order, index)),
    sceneIds: stringArray(value.sceneIds).filter((sceneId) => sceneIds.has(sceneId)),
    sourceReferences: Array.isArray(value.sourceReferences)
      ? value.sourceReferences.map(normalizeReference)
      : [],
    ...(textValue(value.objective) ? { objective: textValue(value.objective) } : {}),
    ...(Number.isFinite(targetDurationSeconds) && targetDurationSeconds > 0
      ? { targetDurationSeconds }
      : {}),
    ...(Array.isArray(value.evidenceUnitIds)
      ? { evidenceUnitIds: stringArray(value.evidenceUnitIds) }
      : {}),
    ...(textValue(value.script) ? { script: textValue(value.script) } : {}),
    ...(textValue(value.generatedAt) ? { generatedAt: textValue(value.generatedAt) } : {}),
    ...(textValue(value.model) ? { model: textValue(value.model) } : {}),
    ...(textValue(value.promptVersion) ? { promptVersion: textValue(value.promptVersion) } : {}),
    ...(textValue(value.inputHash) ? { inputHash: textValue(value.inputHash) } : {}),
    ...(typeof value.cacheHit === 'boolean' ? { cacheHit: value.cacheHit } : {}),
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
    pendingChapters: Array.isArray(value?.pendingChapters)
      ? value.pendingChapters.map((chapter, index) => normalizeProjectChapter(
          chapter,
          index,
          new Set((value.pendingScenes ?? []).map((scene) => textValue(scene.id))),
        ))
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
  const normalizedScenes = scenes.map((scene, index) => normalizeScene(scene, index, defaultSourceId));
  const sceneIds = new Set(normalizedScenes.map((scene) => scene.id));
  const rawChapters = Array.isArray(input.chapters) ? input.chapters : [];
  let chapters = rawChapters.length
    ? rawChapters.map((chapter, index) => normalizeProjectChapter(chapter, index, sceneIds))
    : normalizedScenes.length
      ? [{
          id: 'chapter-01',
          title: textValue(input.title) || '完整视频',
          summary: '',
          order: 0,
          sceneIds: normalizedScenes.map((scene) => scene.id),
          sourceReferences: [],
        }]
      : [];
  const chapterIds = new Set(chapters.map((chapter) => chapter.id));
  const scenesWithChapters = normalizedScenes.map((scene) => ({
    ...scene,
    chapterId: chapterIds.has(scene.chapterId) ? scene.chapterId : chapters[0]?.id ?? '',
  }));
  chapters = chapters.map((chapter) => ({
    ...chapter,
    sceneIds: scenesWithChapters.filter((scene) => scene.chapterId === chapter.id).map((scene) => scene.id),
  }));
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
  const fallbackRenderWidth = numberValue(input.render?.width, 1920);
  const fallbackRenderHeight = numberValue(input.render?.height, 1080);
  const fallbackAspectRatio: CreativeBrief['aspectRatio'] = fallbackRenderWidth === fallbackRenderHeight
    ? '1:1'
    : fallbackRenderWidth > fallbackRenderHeight ? '16:9' : '9:16';

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
    market_status: ['none', 'collecting', 'validated', 'not_validated', 'inconclusive'].includes(input.market_status ?? '')
      ? input.market_status!
      : 'none',
    lifecycle: {
      state: input.lifecycle?.state === 'archived' ? 'archived' : 'active',
      archivedAt: input.lifecycle?.state === 'archived' ? textValue(input.lifecycle.archivedAt) : '',
      archivedBy: input.lifecycle?.state === 'archived' ? textValue(input.lifecycle.archivedBy) : '',
      archiveReason: input.lifecycle?.state === 'archived' ? textValue(input.lifecycle.archiveReason) : '',
    },
    brief: {
      objective: textValue(input.brief?.objective),
      audience: textValue(input.brief?.audience) || textValue(input.targetAudience),
      platform: textValue(input.brief?.platform) || 'landscape-video',
      aspectRatio: ['9:16', '16:9', '1:1'].includes(input.brief?.aspectRatio ?? '')
        ? input.brief!.aspectRatio!
        : fallbackAspectRatio,
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
      ...(textValue(input.platformCopy?.coverAssetPath)
        ? { coverAssetPath: textValue(input.platformCopy?.coverAssetPath) }
        : {}),
      title: textValue(input.platformCopy?.title),
      description: textValue(input.platformCopy?.description),
      hashtags: stringArray(input.platformCopy?.hashtags),
    },
    production: normalizeProduction(input.production, sources),
    materialReview: normalizeMaterialReview(input.materialReview, sources),
    materialQualityReview: normalizeMaterialQualityReview(input.materialQualityReview),
    workflow: normalizeWorkflow(input.workflow),
    chapters,
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
    ...(Array.isArray(input.renditions) && input.renditions.length > 0
      ? { renditions: resolveProjectRenditions(input) }
      : {}),
    render: {
      width: fallbackRenderWidth,
      height: fallbackRenderHeight,
      fps: numberValue(input.render?.fps, 30),
      voice: textValue(input.render?.voice) || 'zh-CN-YunxiNeural',
      rate: numberValue(input.render?.rate, 198),
      voiceEngine: ['edge-tts', 'gemini-tts', 'macos-say'].includes(input.render?.voiceEngine ?? '')
        ? input.render!.voiceEngine!
        : (textValue(input.render?.voice) || 'zh-CN-YunxiNeural').endsWith('Neural')
          ? 'edge-tts'
          : 'macos-say',
      voiceModel: textValue(input.render?.voiceModel)
        || (input.render?.voiceEngine === 'gemini-tts'
          ? 'gemini-3.1-flash-tts-preview'
          : (textValue(input.render?.voice) || 'zh-CN-YunxiNeural').endsWith('Neural')
            ? 'edge-tts-universal'
            : 'macos-say'),
      voiceProfile: textValue(input.render?.voiceProfile) || 'default',
      voiceStyle: textValue(input.render?.voiceStyle),
      voiceGenerationMode: ['batch', 'per-scene'].includes(input.render?.voiceGenerationMode ?? '')
        ? input.render!.voiceGenerationMode!
        : 'auto',
      renderStrategy: input.render?.renderStrategy === 'monolithic'
        ? 'monolithic'
        : 'segmented-concat',
      pronunciations: Array.isArray(input.render?.pronunciations)
        ? input.render.pronunciations.flatMap((item) => {
          const term = textValue(item?.term).trim();
          const guidance = textValue(item?.guidance).trim();
            const spokenText = textValue(item?.spokenText).trim();
            const asrAliases = Array.isArray(item?.asrAliases)
              ? [...new Set(item.asrAliases.map((alias) => textValue(alias).trim()).filter(Boolean))]
              : [];
            return term && guidance ? [{
              term,
              guidance,
              ...(spokenText ? { spokenText } : {}),
              ...(asrAliases.length ? { asrAliases } : {}),
            }] : [];
          })
        : [],
      mediaFit: input.render?.mediaFit === 'cover' ? 'cover' : 'contain',
      subtitleBottom: numberValue(input.render?.subtitleBottom, 0) > 0
        ? numberValue(input.render?.subtitleBottom, 0)
        : undefined,
    },
    scenes: scenesWithChapters,
  };
}

export function readBrief(projectId = DEFAULT_PROJECT_ID) {
  return normalizeBrief(JSON.parse(readFileSync(briefPathFor(projectId), 'utf8')) as LegacyProjectInput);
}

export function projectFingerprint(projectId = DEFAULT_PROJECT_ID) {
  return createHash('sha256').update(readFileSync(briefPathFor(projectId))).digest('hex');
}

export function projectProductionContentFingerprint(projectId = DEFAULT_PROJECT_ID) {
  return productionContentFingerprint(readBrief(projectId));
}

export function projectPackageContentFingerprint(projectId = DEFAULT_PROJECT_ID) {
  return packageContentFingerprint(readBrief(projectId));
}

export function aggregateProjectRightsStatus(
  sources: ShortVideoSource[],
  materialReview?: ProjectMaterialReview,
) {
  const approvedIds = materialReview?.status === 'approved'
    ? [...new Set(materialReview.approvedSourceIds)]
    : [];
  const scopedSources = approvedIds.length > 0
    ? approvedIds.flatMap((sourceId) => {
      const source = sources.find((item) => item.id === sourceId);
      return source ? [source] : [];
    })
    : sources;
  if (approvedIds.length > 0 && scopedSources.length !== approvedIds.length) return 'review_required' as const;
  if (scopedSources.some((source) => source.rightsStatus === 'blocked')) return 'blocked' as const;
  if (scopedSources.length > 0 && scopedSources.every((source) => source.rightsStatus === 'cleared')) {
    return 'cleared' as const;
  }
  return 'review_required' as const;
}

function writeProjectFile(projectId: string, project: ShortVideoProject) {
  assertProjectTargetDuration(project.brief.targetDurationSeconds);
  const targetPath = briefPathFor(projectId);
  writeAtomicJson(targetPath, project);
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
      pendingChapters: [],
    },
  };
}

function currentSourceProcessingIsNewer(current: ShortVideoSource, requested: ShortVideoSource) {
  if (current.processing.attempts !== requested.processing.attempts) {
    return current.processing.attempts > requested.processing.attempts;
  }
  if (current.processing.startedAt !== requested.processing.startedAt) {
    return current.processing.startedAt > requested.processing.startedAt;
  }
  if (current.processing.completedAt !== requested.processing.completedAt) {
    return current.processing.completedAt > requested.processing.completedAt;
  }
  if (current.processing.status === 'running') return true;
  return current.processing.status === 'pending' && requested.processing.status === 'idle';
}

export function updateCanonicalProject(
  projectId: string,
  updater: (project: ShortVideoProject) => ShortVideoProject,
  options: { markRenderStale?: boolean } = {},
) {
  return withJsonFileLock(briefPathFor(projectId), () => {
    const current = readBrief(projectId);
    let next = normalizeBrief(updater(current));
    if (next.id !== projectId) throw new Error('项目 ID 与保存路径不一致。');
    next = invalidatePendingNarrative(current, next);
    if (options.markRenderStale !== false && current.technical_status !== 'not_rendered') {
      next.technical_status = 'stale';
    }
    next.rights_status = aggregateProjectRightsStatus(next.sources, next.materialReview);
    next.production.updatedAt = new Date().toISOString();
    return writeProjectFile(projectId, next);
  });
}

export function writeBrief(
  projectId: string,
  project: ShortVideoProject,
  options: { incrementManualSave?: boolean } = {},
) {
  return withJsonFileLock(briefPathFor(projectId), () => {
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
      sources: current.sources.map((source) => {
        const requested = normalizedSources.get(source.id);
        const preserveProcessing = requested && currentSourceProcessingIsNewer(source, requested);
        return {
          ...source,
          ...requested,
          id: source.id,
          assetPath: source.assetPath,
          ...(preserveProcessing ? {
            processing: source.processing,
            analysis: source.analysis,
          } : {}),
        };
      }),
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
    next.rights_status = aggregateProjectRightsStatus(next.sources, next.materialReview);
    return writeProjectFile(projectId, next);
  });
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
    : '16:9';
  const renderSize = aspectRatio === '16:9'
    ? { width: 1920, height: 1080 }
    : aspectRatio === '1:1'
      ? { width: 1080, height: 1080 }
      : { width: 1080, height: 1920 };
  const createdAt = new Date().toISOString();
  const topicDecision = input.topicApproval
    ? normalizeHumanWorkflowDecision(input.topicApproval.decidedBy, input.topicApproval.note)
    : null;
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
    materialReview: {
      status: 'pending',
      approvedSourceIds: [],
      reviewedAt: '',
    },
    materialQualityReview: {
      schemaVersion: 1,
      status: 'pending',
      reviewedAt: '',
      reviewer: '',
      reviewScope: '所有启用场景的已选候选，覆盖桌面与移动目标视口。',
      sceneReviews: [],
    },
    workflow: {
      schemaVersion: 1,
      origin: {
        kind: input.workflowOrigin?.kind === 'daily_signal' ? 'daily_signal' : 'manual',
        runId: textValue(input.workflowOrigin?.runId),
        candidateId: textValue(input.workflowOrigin?.candidateId),
        sourceUrl: textValue(input.workflowOrigin?.sourceUrl),
        score: Number.isFinite(input.workflowOrigin?.score) ? Number(input.workflowOrigin?.score) : null,
        summary: textValue(input.workflowOrigin?.summary),
      },
      topicApproval: {
        status: topicDecision ? 'approved' : 'pending',
        decidedAt: topicDecision ? createdAt : '',
        decidedBy: topicDecision?.actor ?? '',
        note: topicDecision?.note ?? '',
        fingerprint: '',
      },
      researchApproval: { status: 'pending', decidedAt: '', decidedBy: '', note: '', fingerprint: '' },
      deliveryApproval: { status: 'pending', decidedAt: '', decidedBy: '', note: '', fingerprint: '' },
      publication: {
        approval: { status: 'pending', decidedAt: '', decidedBy: '', note: '', fingerprint: '' },
        platform: '', publishedUrl: '', publishedAt: '', videoSha256: '', packageSha256: '',
      },
      publicationTargets: [],
      market: { decision: 'pending', decidedAt: '', decidedBy: '', note: '', evidence: [] },
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
    render: {
      ...renderSize,
      fps: 30,
      ...DEFAULT_NEW_PROJECT_VOICE,
      renderStrategy: 'segmented-concat',
      pronunciations: [],
      mediaFit: 'contain',
    },
  });
  if (topicDecision) project.workflow.topicApproval.fingerprint = topicApprovalFingerprint(project);
  return withJsonFileLock(targetPath, () => {
    if (existsSync(targetPath)) throw new Error('该项目 ID 已存在。');
    return writeProjectFile(projectId, project);
  });
}

export function listProjects() {
  if (!existsSync(projectsRoot)) return [];
  return readdirSync(projectsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && projectIdPattern.test(entry.name) && existsSync(briefPathFor(entry.name)))
    .map((entry) => readBrief(entry.name))
    .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
}

export function safeProjectSourceFileName(fileName: string) {
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
  if (bytes.byteLength === 0) throw new Error('上传文件为空。');
  const storedName = safeProjectSourceFileName(fileName);
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  const assetDirectory = resolve('public/project-assets', projectId);
  mkdirSync(assetDirectory, { recursive: true });
  const absoluteAssetPath = join(assetDirectory, storedName);
  writeFileSync(absoluteAssetPath, bytes);
  try {
    return registerProjectSourceFile(projectId, fileName, storedName, bytes.byteLength, contentHash, input);
  } catch (error) {
    unlinkSync(absoluteAssetPath);
    throw error;
  }
}

export function projectSourceAssetTarget(projectId: string, fileName: string) {
  const storedName = safeProjectSourceFileName(fileName);
  const assetDirectory = resolve('public/project-assets', assertProjectId(projectId));
  return {
    storedName,
    assetDirectory,
    absoluteAssetPath: join(assetDirectory, storedName),
  };
}

export function registerProjectSourceFile(
  projectId: string,
  fileName: string,
  storedName: string,
  bytes: number,
  contentHash: string,
  input: ImportSourceInput,
) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('上传文件为空。');
  if (!/^[a-f0-9]{64}$/.test(contentHash)) throw new Error('素材内容哈希无效。');
  if (!textValue(input.rightsNote).trim()) throw new Error('必须填写权利与来源说明。');
  if (basename(storedName) !== storedName || sourceTypeForFile(storedName) !== sourceTypeForFile(fileName)) {
    throw new Error('素材存储文件名无效。');
  }
  return withJsonFileLock(briefPathFor(projectId), () => {
    const project = readBrief(projectId);
    const sourceType = sourceTypeForFile(fileName);
    const importedAt = new Date().toISOString();
    const reusedFrom = findReusableSource(contentHash, projectId, importedAt);
    const id = `source-${String(project.sources.length + 1).padStart(2, '0')}`;
    const source: ShortVideoSource = {
      id,
      label: textValue(input.label).trim() || fileName,
      sourceType,
      materialRole: input.materialRole ?? (sourceType === 'video' || sourceType === 'image' ? 'official_demo' : 'research'),
      originUrl: textValue(input.originUrl),
      assetPath: `public/project-assets/${projectId}/${storedName}`,
      originalFileName: fileName,
      mimeType: textValue(input.mimeType),
      bytes,
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
      selectionStatus: 'ai_suggested',
      selectionReviewedAt: '',
      selectionNote: '首个可视素材自动填入，尚未经过 Codex 或用户复核。',
    }, 0, id)];
    const next: ShortVideoProject = {
      ...project,
      technical_status: project.technical_status === 'not_rendered' ? 'not_rendered' : 'stale',
      rights_status: aggregateProjectRightsStatus([...project.sources, source]),
      production: {
        ...project.production,
        updatedAt: new Date().toISOString(),
        sourceImportCount: project.production.sourceImportCount + 1,
        reusedSourceIds: reusedFrom
          ? [...new Set([...project.production.reusedSourceIds, id])]
          : project.production.reusedSourceIds,
      },
      materialReview: {
        ...project.materialReview,
        status: 'pending',
        reviewedAt: '',
      },
      sources: [...project.sources, source],
      scenes,
    };
    writeProjectFile(projectId, next);
    return { project: next, source };
  });
}

export function approveProjectMaterials(projectId: string, sourceIds: string[]) {
  return updateCanonicalProject(projectId, (project) => {
    const uniqueIds = [...new Set(sourceIds)];
    const selected = uniqueIds.map((sourceId) => {
      const source = project.sources.find((item) => item.id === sourceId);
      if (!source) throw new Error(`素材 ${sourceId} 不存在。`);
      if (source.sourceType !== 'video' && source.sourceType !== 'image') {
        throw new Error(`素材 ${sourceId} 不是图片或视频。`);
      }
      if (source.materialRole === 'research') throw new Error(`素材 ${sourceId} 仅用于研究，不能进入成片。`);
      if (source.rightsStatus === 'blocked') throw new Error(`素材 ${sourceId} 已标记为禁止使用。`);
      return source;
    });
    if (!selected.length) throw new Error('请至少选择一份可视素材。');
    const materialReview: ProjectMaterialReview = {
      status: 'approved',
      approvedSourceIds: uniqueIds,
      reviewedAt: new Date().toISOString(),
    };
    const readiness = materialReviewReadiness(materialReview, project.sources);
    if (!readiness.ready) throw new Error(readiness.reason);
    return {
      ...project,
      materialReview,
      production: { ...project.production, updatedAt: new Date().toISOString() },
    };
  });
}

export function recordRenderAttempt(projectId: string) {
  const startedAt = new Date().toISOString();
  return updateCanonicalProject(projectId, (project) => {
    const readiness = materialReviewReadiness(project.materialReview, project.sources);
    if (!readiness.ready) throw new Error(readiness.reason);
    const enabledScenes = project.scenes.filter((scene) => scene.enabled);
    const selectionReadiness = sceneSelectionReadiness(
      enabledScenes,
      project.materialReview.approvedSourceIds,
    );
    if (!selectionReadiness.ready) throw new Error(selectionReadiness.reason);
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

export function projectPaths(project: ShortVideoProject, renditionId = '') {
  const rendition = resolveProjectRendition(project, renditionId);
  const workDir = resolve(rendition.workDir);
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
    rendition,
    outputVideoPath: resolve(rendition.outputVideo),
    publicRenderPath: resolve(rendition.publicRender),
    publicRenderHref: publicHref(rendition.publicRender) ?? '',
    exportDir: resolve(project.outputs.exportDir),
    exportZipPath: resolve(`${project.outputs.exportDir}.zip`),
    coverImagePath: resolve(project.outputs.coverImage),
    platformCopyPath: resolve(project.outputs.platformCopy),
    sourceListPath: resolve(project.outputs.sourceList),
    projectSnapshotPath: resolve(project.outputs.projectSnapshot),
    exportManifestPath: resolve(project.outputs.exportDir, 'export-manifest.json'),
    exportPackageReceiptPath: resolve(`${project.outputs.exportDir}.package.json`),
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
    !['queued', 'running', 'cancelling', 'cancelled', 'awaiting_review', 'completed', 'failed'].includes(value.state ?? '') ||
    !['saving', 'rendering', 'proof', 'review', 'packaging', 'completed'].includes(value.stage ?? '')
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
    (manifest.productionContentFingerprint
      ? manifest.productionContentFingerprint !== projectProductionContentFingerprint(projectId)
      : manifest.projectFingerprint !== projectFingerprint(projectId))
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
      label: '等待技术检查',
      message: '成片已生成，但尚未通过格式、音轨、解码和基础画面检查。',
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
  const videoPath = manifest.artifacts.publicRender ?? manifest.artifacts.outputVideo;
  const acceptance = manifest.acceptance;
  const videoSha256 = fileSha256(videoPath);
  const acceptanceState = renderAcceptanceState(acceptance, videoSha256);
  if (acceptanceState === 'awaiting_semantic') {
    return {
      state: 'awaiting_semantic',
      label: '技术检查通过，等待内容验收',
      message: '需要逐场景核对旁白、字幕、来源窗口和实际可见画面。',
      renderedAt: manifest.renderedAt,
      duration: manifest.render.duration,
    };
  }
  if (acceptanceState === 'review_failed' && acceptance?.semantic.status === 'failed') {
    return {
      state: 'review_failed',
      label: '语义验收未通过',
      message: acceptance.semantic.issues.join('；') || '至少一个场景的旁白与画面不一致。',
      renderedAt: manifest.renderedAt,
      duration: manifest.render.duration,
    };
  }
  if (acceptanceState === 'review_failed') {
    return {
      state: 'review_failed',
      label: '浏览器验收未通过',
      message: acceptance?.browser.issues.join('；') || acceptance?.browser.mediaError || '真实播放器未能完整播放到结尾。',
      renderedAt: manifest.renderedAt,
      duration: manifest.render.duration,
    };
  }
  if (acceptanceState === 'awaiting_browser') {
    return {
      state: 'awaiting_browser',
      label: '内容验收通过，等待浏览器验收',
      message: '需要在真实播放器中确认媒体加载、播放推进和最后一段结束事件。',
      renderedAt: manifest.renderedAt,
      duration: manifest.render.duration,
    };
  }
  const project = readBrief(projectId);
  const paths = projectPaths(project);
  const packageStatus = exportPackageReadiness({
    projectId,
    projectFingerprint: manifest.projectFingerprint,
    productionContentFingerprint: manifest.productionContentFingerprint,
    packageContentFingerprint: projectPackageContentFingerprint(projectId),
    renderedAt: manifest.renderedAt,
    renderManifestPath: paths.manifestPath,
    videoPath,
    coverPath: paths.coverImagePath,
    zipPath: paths.exportZipPath,
    deliveryApproval: project.workflow.deliveryApproval,
    receipt: readExportPackageReceipt(paths.exportPackageReceiptPath),
  });
  const deliveryApproved = approvalIsCurrent(project.workflow.deliveryApproval, videoSha256);
  return {
    state: 'ready',
    label: packageStatus.ready
      ? '成片与导出包已验收'
      : deliveryApproved
        ? '成片已批准，导出包待生成'
        : '自动验收通过，等待真人审片',
    message: packageStatus.ready
      ? '技术、逐场景语义和真实浏览器播放均通过，导出包与当前版本一致。'
      : deliveryApproved
        ? '真人已批准当前视频字节，完整 ZIP 尚未绑定当前版本。'
        : '技术、逐场景语义和真实浏览器播放均通过；仍需真人一倍速完整审片并明确批准。',
    renderedAt: manifest.renderedAt,
    duration: manifest.render.duration,
    packageReady: packageStatus.ready,
    packageMessage: packageStatus.reason,
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
