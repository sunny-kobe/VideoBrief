export interface ChapterFingerprintRecord {
  chapterId: string;
  order: number;
  sceneIds: string[];
  durationSeconds: number;
  fingerprint: string;
}

export interface ChapterFingerprintManifest {
  schemaVersion: 1;
  sharedFingerprint: string;
  chapters: ChapterFingerprintRecord[];
}

export interface SemanticReviewReuse {
  sourceVideoSha256: string;
  reusedChapterIds: string[];
  invalidatedChapterIds: string[];
  reusedSceneReviews: Array<{
    sceneId: string;
    chapterId: string;
    note: string;
    reviewedAt: string;
    reviewer: string;
    sourceVideoSha256: string;
  }>;
  reusedDurationSeconds: number;
  changedDurationSeconds: number;
}

export function buildChapterFingerprints(input: {
  project: any;
  renderPlan: any;
  renderSettings: Record<string, unknown>;
  voiceSettings: Record<string, unknown>;
}): ChapterFingerprintManifest;

export function buildSemanticReviewReuse(
  previousManifest: any,
  currentFingerprints: ChapterFingerprintManifest,
): SemanticReviewReuse;

export function validateChapterFingerprintManifest(input: {
  project: any;
  renderPlan: any;
  manifest: any;
}): string[];
