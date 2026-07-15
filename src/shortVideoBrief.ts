export type ShortVideoProjectStatus = 'draft' | 'review' | 'ready' | 'published';

export type TechnicalStatus = 'not_rendered' | 'stale' | 'unverified' | 'passed' | 'failed';
export type ProjectRightsStatus = 'cleared' | 'review_required' | 'blocked';
export type PublicationStatus = 'draft-unpublished' | 'ready-for-review' | 'published';
export type MarketStatus = 'none' | 'collecting' | 'validated';

export type SourceVerificationStatus = 'verified' | 'needs_check' | 'weak';

export type SourceRightsStatus = 'cleared' | 'review_required' | 'blocked';

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
  stage: 'idle' | 'local-extraction' | 'transcription' | 'vision' | 'fact-extraction' | 'completed';
  attempts: number;
  inputHash: string;
  startedAt: string;
  completedAt: string;
  error: string;
  model: string;
  promptVersion: string;
  cacheHit: boolean;
}

export interface SourceAnalysis {
  extractedText: string;
  visualDescription: string;
  transcript: TranscriptSegment[];
  facts: ResearchFact[];
  uncertainties: ResearchUncertainty[];
}

export interface ShortVideoSource {
  id: string;
  label: string;
  sourceType: SourceType;
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
  generatedBy: 'user' | 'ai';
  userEdited: boolean;
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
    voiceAdapter?: 'edge-tts' | 'macos-say';
  };
  artifacts: {
    outputVideo: string;
    publicRender: string | null;
    subtitles: string;
    srt: string;
    voiceover: string;
    timeline: string;
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
    showEditorialOverlay?: boolean;
  }>;
  proof?: RenderManifestProof;
}

export interface WorkbenchRenderStatus {
  state: 'missing' | 'stale' | 'unverified' | 'ready';
  label: string;
  message: string;
  renderedAt?: string;
  duration?: number;
}

export interface RenderJobRecord {
  schemaVersion: 1;
  projectId: string;
  state: 'running' | 'completed' | 'failed';
  stage: 'saving' | 'rendering' | 'proof' | 'packaging' | 'completed';
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
