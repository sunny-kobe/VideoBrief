export interface SemanticReviewRequest {
  decision: string;
  reviewer?: string;
  note?: string;
  freezeIntervalCount?: number;
  confirmFreezeWarnings?: boolean;
  pronunciationWarningCount?: number;
  confirmPronunciationWarnings?: boolean;
  sceneCount?: number;
  videoDurationSeconds?: number;
  reviewDurationSeconds?: number;
  activeSeconds?: number;
  activeSecondsSource?: string;
}

export function validateSemanticReviewRequest(input: SemanticReviewRequest): {
  valid: boolean;
  reviewer: string;
  note: string;
  activeSeconds: number | null;
  minimumActiveSeconds: number;
  reviewDurationSeconds: number;
  issues: string[];
};

export interface SemanticReviewSession {
  schemaVersion?: number;
  status?: string;
  sessionId?: string;
  projectId?: string;
  projectFingerprint?: string;
  videoSha256?: string;
  startedAt?: string;
}

export function validateReviewSession(input: {
  session?: SemanticReviewSession | null;
  projectId: string;
  projectFingerprint: string;
  videoSha256: string;
  now?: string;
}): { valid: boolean; activeSeconds: number | null; issues: string[] };

export function reviewSessionTargetsArtifact(
  session: SemanticReviewSession | null | undefined,
  artifact: {
    projectId: string;
    projectFingerprint: string;
    videoSha256: string;
  },
): boolean;

export function validateSemanticAcceptanceRecord(
  semantic?: Record<string, any> | null,
): { passed: boolean; issues: string[] };

export const EDITORIAL_QUALITY_CHECK_IDS: readonly string[];

export interface EditorialQualityCheck {
  status: string;
  note: string;
}

export interface EditorialQualityReview {
  schemaVersion?: number;
  profile?: string;
  status?: string;
  checks?: Record<string, EditorialQualityCheck>;
}

export function validateEditorialQualityReview(input: {
  decision: string;
  review?: EditorialQualityReview | null;
}): {
  valid: boolean;
  review: EditorialQualityReview | null;
  issues: string[];
};

export function intervalCoverage(
  intervals: Array<{ start?: number; end?: number }>,
  duration: number,
): { seconds: number; ratio: number };

export function validateSceneReviewNotes(input: {
  decision: string;
  sceneIds: string[];
  requiredSceneIds?: string[];
  sceneNotes?: Record<string, string> | null;
}): {
  valid: boolean;
  notes: Record<string, string>;
  issues: string[];
};

export interface BrowserAcceptanceCheck {
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
}

export function validateBrowserChecks(
  checks: BrowserAcceptanceCheck[],
  expectedDuration: number,
): { passed: boolean; issues: string[] };
