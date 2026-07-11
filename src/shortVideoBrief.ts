export type ShortVideoProjectStatus = 'draft' | 'review' | 'ready' | 'published';

export type SourceVerificationStatus = 'verified' | 'needs_check' | 'weak';

export type SourceRightsStatus = 'cleared' | 'review_required' | 'blocked';

export interface ShortVideoSource {
  id: string;
  label: string;
  sourceType: 'official' | 'github' | 'paper' | 'demo' | 'social' | 'video' | 'news';
  originUrl: string;
  assetPath: string;
  publishedAt: string;
  verificationStatus: SourceVerificationStatus;
  rightsStatus: SourceRightsStatus;
  rightsNote: string;
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
}

export interface ShortVideoProjectScene {
  id: string;
  enabled: boolean;
  sourceId: string;
  sourceStart: number;
  sourceEnd: number;
  eyebrow: string;
  title: string;
  subtitle: string;
}

export interface ShortVideoProject {
  schemaVersion: 1;
  id: string;
  title: string;
  format: 'single_signal';
  targetAudience: string;
  status: ShortVideoProjectStatus;
  sources: ShortVideoSource[];
  editorial: ShortVideoEditorial;
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
  };
  artifacts: {
    outputVideo: string;
    publicRender: string | null;
    subtitles: string;
    srt: string;
    voiceover: string;
    timeline: string;
  };
  scenes: Array<{
    id: string;
    sourceId: string;
    start: number;
    end: number;
    sourceStart: number;
    sourceEnd: number;
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

// Compatibility aliases for callers that still use the original brief naming.
export type ShortVideoBrief = ShortVideoProject;
export type ShortVideoBriefScene = ShortVideoProjectScene;

export const DEFAULT_BRIEF_PATH = 'content/projects/codex-app-explainer/project.json';
