export type ShortVideoProjectStatus = 'draft' | 'review' | 'ready' | 'published';

export type TechnicalStatus = 'not_rendered' | 'stale' | 'unverified' | 'passed' | 'failed';
export type ProjectRightsStatus = 'cleared' | 'review_required' | 'blocked';
export type PublicationStatus = 'draft-unpublished' | 'ready-for-review' | 'published';
export type MarketStatus = 'none' | 'collecting' | 'validated';

export type SourceVerificationStatus = 'verified' | 'needs_check' | 'weak';

export type SourceRightsStatus = 'cleared' | 'review_required' | 'blocked';

export type MaterialRole = 'official_demo' | 'broll' | 'evidence' | 'research';
export type SceneSelectionStatus = 'unselected' | 'ai_suggested' | 'codex_reviewed' | 'user_approved';

export type SourceType =
  | 'official'
  | 'github'
  | 'paper'
  | 'demo'
  | 'social'
  | 'video'
  | 'audio'
  | 'image'
  | 'markdown'
  | 'text'
  | 'news';

export type ProcessingStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed';

export interface SourceReference {
  sourceId: string;
  locatorType: 'time' | 'line' | 'image' | 'file';
  start?: number;
  end?: number;
  lineStart?: number;
  lineEnd?: number;
  note: string;
}

export interface TranscriptSegment {
  id: string;
  sourceId: string;
  start: number;
  end: number;
  text: string;
}

export interface ResearchFact {
  id: string;
  statement: string;
  sourceReferences: SourceReference[];
  reviewStatus: 'proposed' | 'confirmed' | 'rejected';
  kind: 'claim' | 'visual_metadata';
  reviewPriority: 'required' | 'supporting' | 'reference';
  briefRelevance: number;
}

export interface ResearchUncertainty {
  id: string;
  statement: string;
  sourceReferences: SourceReference[];
  resolution: string;
  riskLevel: 'high' | 'medium' | 'low';
  reviewPriority: 'required' | 'supporting' | 'reference';
  briefRelevance: number;
}

export interface SourceProcessing {
  status: ProcessingStatus;
  stage: 'idle' | 'local-extraction' | 'transcription' | 'vision' | 'fact-extraction' | 'hierarchy' | 'completed';
  attempts: number;
  inputHash: string;
  startedAt: string;
  completedAt: string;
  error: string;
  model: string;
  promptVersion: string;
  cacheHit: boolean;
  chapterProgress?: {
    completed: number;
    total: number;
  };
}

export interface SourceAnalysis {
  extractedText: string;
  visualDescription: string;
  hierarchicalSummary: string;
  transcript: TranscriptSegment[];
  facts: ResearchFact[];
  uncertainties: ResearchUncertainty[];
  chapters: SourceAnalysisChapter[];
}

export interface SourceAnalysisChapter {
  id: string;
  sourceId: string;
  index: number;
  start: number;
  end: number;
  title: string;
  summary: string;
  visualDescription: string;
  frameSamples: Array<{
    second: number;
    reason: 'coverage' | 'scene-change';
  }>;
  transcript: TranscriptSegment[];
  facts: ResearchFact[];
  uncertainties: ResearchUncertainty[];
  processing: {
    status: 'pending' | 'completed' | 'failed';
    inputHash: string;
    model: string;
    promptVersion: string;
    cacheHit: boolean;
    error: string;
    resumeKey?: string;
  };
}

export interface ShortVideoSource {
  id: string;
  label: string;
  sourceType: SourceType;
  materialRole: MaterialRole;
  originUrl: string;
  assetPath: string;
  originalFileName: string;
  mimeType: string;
  bytes: number;
  importedAt: string;
  publishedAt: string;
  verificationStatus: SourceVerificationStatus;
  rightsStatus: SourceRightsStatus;
  rightsNote: string;
  contentHash: string;
  reusedFrom: { projectId: string; sourceId: string } | null;
  processing: SourceProcessing;
  analysis: SourceAnalysis;
}

export interface CreativeBrief {
  objective: string;
  audience: string;
  platform: string;
  aspectRatio: '9:16' | '16:9' | '1:1';
  targetDurationSeconds: number;
  tone: string;
  style: string;
  reference: string;
  coreMessage: string;
  cta: string;
  prohibitedMaterial: string;
}

export interface ShortVideoEditorial {
  claim: string;
  whyItMatters: string;
  chinaContext: string;
  riskNote: string;
}

export interface ShortVideoRenderConfig {
  width: number;
  height: number;
  fps: number;
  voice: string;
  rate: number;
  voiceEngine: 'edge-tts' | 'gemini-tts' | 'macos-say';
  voiceModel: string;
  voiceProfile: string;
  voiceStyle: string;
  voiceGenerationMode: 'auto' | 'batch' | 'per-scene';
  renderStrategy: 'segmented-concat' | 'monolithic';
  pronunciations: Array<{
    term: string;
    guidance: string;
    spokenText?: string;
    asrAliases?: string[];
  }>;
  mediaFit: 'contain' | 'cover';
}

export interface ShortVideoOutputs {
  outputVideo: string;
  publicRender: string;
  workDir: string;
  exportDir: string;
  coverImage: string;
  platformCopy: string;
  sourceList: string;
  projectSnapshot: string;
}

export interface SceneCandidate {
  id: string;
  sourceId: string;
  assetPath: string;
  mediaType: 'video' | 'image';
  sourceStart: number;
  sourceEnd: number;
  matchReason: string;
  rightsStatus: SourceRightsStatus;
}

export interface ShortVideoProjectScene {
  id: string;
  chapterId: string;
  enabled: boolean;
  sourceId: string;
  sourceStart: number;
  sourceEnd: number;
  showEditorialOverlay?: boolean;
  eyebrow: string;
  title: string;
  subtitle: string;
  narration: string;
  visualRequirement: string;
  sourceReferences: SourceReference[];
  candidates: SceneCandidate[];
  selectedCandidateId: string;
  selectionStatus: SceneSelectionStatus;
  selectionReviewedAt: string;
  selectionNote: string;
  generatedBy: 'user' | 'ai';
  userEdited: boolean;
}

export interface ProjectChapter {
  id: string;
  title: string;
  summary: string;
  order: number;
  sceneIds: string[];
  sourceReferences: SourceReference[];
  objective?: string;
  targetDurationSeconds?: number;
  evidenceUnitIds?: string[];
  script?: string;
  generatedAt?: string;
  model?: string;
  promptVersion?: string;
  inputHash?: string;
  cacheHit?: boolean;
}

export interface ProjectResearch {
  transcripts: TranscriptSegment[];
  facts: ResearchFact[];
  uncertainties: ResearchUncertainty[];
}

export interface NarrativeVersion {
  id: string;
  generatedAt: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  conclusion: string;
  hook: string;
  outline: string[];
  voiceoverScript: string;
  sourceReferences: SourceReference[];
  uncertainties: string[];
}

export interface ProjectNarrative {
  status: ProcessingStatus;
  error: string;
  activeVersionId: string;
  versions: NarrativeVersion[];
  pendingDraft: NarrativeVersion | null;
  pendingScenes: ShortVideoProjectScene[];
  pendingChapters: ProjectChapter[];
  generatedAt: string;
  model: string;
  promptVersion: string;
}

export interface AiCallRecord {
  id: string;
  purpose: 'source-analysis' | 'narrative-planning' | 'candidate-ranking' | 'production-assets';
  status: 'completed' | 'failed';
  model: string;
  promptVersion: string;
  inputHash: string;
  startedAt: string;
  completedAt: string;
  error: string;
  cacheHit: boolean;
}

export interface ProjectAiState {
  provider: 'openai';
  model: string;
  transcriptionModel: string;
  promptVersion: string;
  calls: AiCallRecord[];
}

export interface PlatformCopy {
  coverTitle: string;
  title: string;
  description: string;
  hashtags: string[];
}

export interface ProjectProductionRecord {
  trackingStartedAt: string;
  updatedAt: string;
  researchReviewedAt: string;
  firstRenderCompletedAt: string;
  lastRenderCompletedAt: string;
  sourceImportCount: number;
  manualSaveCount: number;
  renderAttemptCount: number;
  renderFailureCount: number;
  lastRenderStartedAt: string;
  lastRenderError: string;
  reusedSourceIds: string[];
}

export interface ProjectMaterialReview {
  status: 'pending' | 'approved';
  approvedSourceIds: string[];
  reviewedAt: string;
}

export interface ShortVideoProject {
  schemaVersion: 3;
  id: string;
  title: string;
  format: 'video_project' | 'single_signal';
  targetAudience: string;
  status: ShortVideoProjectStatus;
  technical_status: TechnicalStatus;
  rights_status: ProjectRightsStatus;
  publication_status: PublicationStatus;
  market_status: MarketStatus;
  brief: CreativeBrief;
  sources: ShortVideoSource[];
  research: ProjectResearch;
  narrative: ProjectNarrative;
  ai: ProjectAiState;
  editorial: ShortVideoEditorial;
  platformCopy: PlatformCopy;
  production: ProjectProductionRecord;
  materialReview: ProjectMaterialReview;
  chapters: ProjectChapter[];
  outputs: ShortVideoOutputs;
  render: ShortVideoRenderConfig;
  scenes: ShortVideoProjectScene[];
}

export interface ProductionScene extends ShortVideoProjectScene {
  rawPath?: string;
  paddedPath?: string;
  duration: number;
  start: number;
  end: number;
  speechDuration?: number;
  speechStart?: number;
  speechEnd?: number;
}

export interface ProductionTimeline {
  briefPath?: string;
  duration: number;
  scenes: ProductionScene[];
}

export interface RenderManifestProof {
  passed: boolean;
  checkedAt: string;
  issues: string[];
  frames: string[];
  quality?: {
    integratedLufs: number | null;
    truePeakDbtp: number | null;
    blackSegments: Array<{ start: number; end: number; duration: number }>;
    freezeIntervals: Array<{ start: number; end: number; duration: number }>;
    warnings: string[];
  };
  narration?: {
    passed: boolean;
    checkedAt: string;
    provider: string;
    model: string;
    expectedTextSha256: string;
    transcript: string;
    transcriptPath: string;
    similarity: number;
    lengthRatio: number;
    termChecks?: Array<{
      term: string;
      aliases: string[];
      relevant: boolean;
      matched: boolean;
      matchedAlias: string;
    }>;
    warnings: string[];
  };
}

export type RenderAcceptanceStatus = 'pending' | 'passed' | 'failed';

export interface RenderSemanticSceneReview {
  sceneId: string;
  status: RenderAcceptanceStatus;
  frames: string[];
  note: string;
}

export interface ProductionMetrics {
  schemaVersion: 1;
  finalizedAt: string;
  renderCache?: {
    strategy: 'segmented-concat' | 'monolithic';
    sceneSegments: number;
    sceneSegmentCacheHits: number;
    sceneSegmentCacheMisses: number;
    finalVideoReencoded: boolean;
    finalAudioReencoded: boolean;
  } | null;
  elapsed: Record<string, unknown>;
  operatorActive: {
    manualReviewSeconds: number | null;
    measurement: 'system_measured' | 'legacy_recorded' | 'not_recorded';
    source: string;
  };
  requests: Record<string, number>;
  failureCost: Record<string, unknown>;
}

export interface RenderAcceptance {
  videoSha256: string;
  semantic: {
    status: RenderAcceptanceStatus;
    checkedAt: string;
    reviewer: string;
    activeSeconds?: number | null;
    activeSecondsSource?: 'review-session' | 'legacy-manual';
    minimumActiveSeconds?: number;
    reviewSessionId?: string;
    reviewSessionPath?: string;
    reviewSessionStartedAt?: string;
    processStartedAt?: string;
    processWallMs?: number;
    note?: string;
    confirmedFreezeWarnings?: boolean;
    freezeIntervalCount?: number;
    confirmedPronunciationWarnings?: boolean;
    pronunciationWarningCount?: number;
    editorialQuality?: {
      schemaVersion: 1;
      profile: string;
      status: 'passed' | 'failed';
      sourcePath: string;
      checks: Record<string, { status: string; note: string }>;
      signals: {
        sceneCount: number;
        freezeIntervalCount: number;
        freezeCoverageSeconds: number;
        freezeCoverageRatio: number;
        narrationSimilarity: number | null;
        unmatchedPronunciationTerms: string[];
      };
    } | null;
    issues: string[];
    scenes: RenderSemanticSceneReview[];
  };
  browser: {
    status: RenderAcceptanceStatus;
    checkedAt: string;
    url: string;
    browser: string;
    viewport: { width: number; height: number } | null;
    readyState: number | null;
    duration: number | null;
    playedSeconds: number | null;
    ended: boolean;
    consoleErrors: string[];
    mediaError: string;
    screenshot: string;
    processStartedAt?: string;
    processWallMs?: number;
    checks?: Array<{
      name: string;
      viewport: { width: number; height: number };
      readyState: number | null;
      duration: number | null;
      playedSeconds: number | null;
      ended: boolean;
      fullPlayback: boolean;
      playbackRate: number;
      muted: boolean;
      volume: number;
      consoleErrors: string[];
      mediaError: string;
      screenshot: string;
    }>;
    issues: string[];
  };
}

export interface ShortVideoRenderManifest {
  schemaVersion: 1;
  projectId: string;
  projectFingerprint: string;
  renderedAt: string;
  briefPath: string;
  render: {
    width: number;
    height: number;
    fps: number;
    duration: number;
    voice?: string;
    rate?: number;
    voiceAdapter?: 'edge-tts' | 'gemini-tts' | 'macos-say';
    voiceEngine?: 'edge-tts' | 'gemini-tts' | 'macos-say';
    voiceModel?: string;
    voiceProfile?: string;
    voiceStyle?: string;
    voiceGenerationMode?: 'auto' | 'batch' | 'per-scene';
    renderStrategy?: 'segmented-concat' | 'monolithic';
    pronunciations?: Array<{
      term: string;
      guidance: string;
      spokenText?: string;
      asrAliases?: string[];
    }>;
    mediaFit?: 'contain' | 'cover';
  };
  voiceover?: {
    engine: 'edge-tts' | 'gemini-tts' | 'macos-say';
    model: string;
    voice: string;
    profile: string;
    style: string;
    generationModeRequested?: 'auto' | 'batch' | 'per-scene';
    pronunciations: Array<{ term: string; guidance: string; spokenText?: string }>;
    segments: Array<{
      sceneId: string;
      cacheKey: string;
      audioSha256: string;
      cacheHit: boolean;
      mimeType: string;
      sourceSampleRate: number | null;
    }>;
  };
  artifacts: {
    outputVideo: string;
    publicRender: string | null;
    subtitles: string;
    srt: string;
    voiceover: string;
    timeline: string;
    renderPlan?: string;
    videoSegmentList?: string;
    coverImage?: string;
    platformCopy?: string;
    sourceList?: string;
    projectSnapshot?: string;
    exportManifest?: string;
  };
  scenes: Array<{
    id: string;
    sourceId: string;
    start: number;
    end: number;
    sourceStart: number;
    sourceEnd: number;
    renderSourceEnd?: number | null;
    frameCount?: number;
    segmentCacheKey?: string;
    segmentCacheHit?: boolean;
    segmentPath?: string;
    segmentSha256?: string;
    showEditorialOverlay?: boolean;
  }>;
  proof?: RenderManifestProof;
  acceptance?: RenderAcceptance;
  productionMetrics?: ProductionMetrics | { stages: Record<string, unknown> };
}

export interface WorkbenchRenderStatus {
  state: 'missing' | 'stale' | 'unverified' | 'awaiting_semantic' | 'awaiting_browser' | 'review_failed' | 'ready';
  label: string;
  message: string;
  renderedAt?: string;
  duration?: number;
  packageReady?: boolean;
  packageMessage?: string;
}

export interface RenderJobRecord {
  schemaVersion: 1;
  projectId: string;
  state: 'queued' | 'running' | 'cancelling' | 'cancelled' | 'awaiting_review' | 'completed' | 'failed';
  stage: 'saving' | 'rendering' | 'proof' | 'review' | 'packaging' | 'completed';
  jobId?: string;
  processId?: number;
  workerPid?: number;
  queuePosition?: number;
  resumedFromJobId?: string;
  cancelRequestedAt?: string;
  queuedAt?: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string;
  error: string;
}

// Compatibility aliases for callers that still use the original brief naming.
export type ShortVideoBrief = ShortVideoProject;
export type ShortVideoBriefScene = ShortVideoProjectScene;

export const DEFAULT_BRIEF_PATH = 'content/projects/codex-app-explainer/project.json';
export const DEFAULT_PROJECT_ID = 'codex-app-explainer';
