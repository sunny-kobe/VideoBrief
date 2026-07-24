export interface PipelineCodeSnapshot {
  schemaVersion: 1;
  fingerprint: string;
  git: {
    available: boolean;
    head: string;
    dirty: boolean | null;
    changedPaths: string[];
  };
  files: Array<{ path: string; sha256: string; content: string }>;
}

export function buildPipelineCodeSnapshot(options?: {
  root?: string;
  files?: string[];
}): PipelineCodeSnapshot;
export function summarizePipelineCodeSnapshot(
  snapshot: PipelineCodeSnapshot,
  snapshotSha256?: string,
): Omit<PipelineCodeSnapshot, 'files'> & {
  snapshotSha256: string;
  files: Array<{ path: string; sha256: string }>;
};
export function validatePipelineCodeSnapshot(snapshot: unknown): string[];
export function validateCurrentPipelineCode(
  manifestPipelineCode: unknown,
  options?: { root?: string; files?: string[] },
): string[];
