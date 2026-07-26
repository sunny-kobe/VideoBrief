export interface ReviewWorkPackageScene {
  sceneId: string;
  title: string;
  subtitle: string;
  narration: string;
  visualRequirement: string;
  outputStart: number;
  outputEnd: number;
  sourceId: string;
  sourceLabel: string;
  sourceStart: number;
  sourceEnd: number;
  selectedCandidateId: string;
  selectionStatus: string;
  matchReason: string;
  rightsStatus: string;
  frames: string[];
  freezeIntervals: Array<{ start: number; end: number; duration?: number }>;
  risks: string[];
}

export interface ReviewWorkPackage {
  schemaVersion: 1;
  projectId: string;
  projectTitle: string;
  videoPath: string;
  videoSha256: string;
  duration: number;
  technicalProofPassed: boolean;
  technicalWarnings: string[];
  sceneCount: number;
  scenes: ReviewWorkPackageScene[];
}

export function buildReviewWorkPackage(project: unknown, manifest: unknown): ReviewWorkPackage;
export function renderReviewWorkPackageHtml(
  reviewPackage: ReviewWorkPackage,
  pathToUrl?: (path: string) => string,
): string;
