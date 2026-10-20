export interface AudienceReviewInput {
  project: Record<string, unknown>;
  manifest?: Record<string, unknown> | null;
  timeline?: Record<string, unknown> | null;
  projectText?: string;
  briefPath?: string;
  artifactIssues?: string[];
}

export interface AudienceSceneDiagnostic {
  sceneId: string;
  title: string;
  narration: string;
  visualRequirement: string;
  outputStartSeconds: number | null;
  outputEndSeconds: number | null;
  durationSeconds: number | null;
  speechDurationSeconds: number | null;
  tailSeconds: number | null;
  sourceWindow: { sourceId: string; startSeconds: number | null; endSeconds: number | null };
  material: {
    mediaType: string | null;
    sourceLabel: string | null;
    originUrl: string | null;
    matchReason: string | null;
    realFootageStatus: 'not-assessed';
    note: string;
  };
}

export interface AudienceProjectDiagnostic {
  projectId: string;
  title: string;
  briefPath: string | null;
  status: 'needs-viewing';
  evidence: { status: 'current' | 'stale' | 'unavailable'; issues: string[] };
  durationSeconds: number | null;
  configuredAudio: { engine: string | null; voice: string | null; rate: number | null; style: string | null; generationMode: string | null } | null;
  actualAudio: {
    status: string;
    engine: string | null;
    model: string | null;
    voice: string | null;
    rate: number | null;
    profile: string | null;
    style: string | null;
    generationMode: string | null;
    styleControl: string;
    note: string;
  };
  scenes: AudienceSceneDiagnostic[];
  tailDistribution: {
    status: string;
    knownSceneCount: number;
    unknownSceneCount: number;
    minimumSeconds: number | null;
    maximumSeconds: number | null;
    meanSeconds: number | null;
    standardDeviationSeconds: number | null;
    note: string;
  };
  subtitleReview: {
    status: string;
    cues: Array<{ sceneId: string; text: string; outputStartSeconds: number | null; durationSeconds: number; status: 'needs-listening' }> | null;
    criteria: { connectorOnly: boolean; minimumDisplaySeconds: number };
    note: string;
  };
  editorialChecks: Record<string, { status?: string; note?: string }> | null;
}

export function buildAudienceExperienceReview(inputs: AudienceReviewInput[]): {
  schemaVersion: 1;
  status: 'needs-viewing';
  mode: 'diagnostic-only';
  note: string;
  projects: AudienceProjectDiagnostic[];
  repeatedEditorialNotes: Array<{ checkId: string; note: string; projectIds: string[]; status: 'needs-review' }>;
  repeatedNotesCaveat: string;
};
