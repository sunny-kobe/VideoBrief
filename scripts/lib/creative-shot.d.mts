export interface CreativeShotInput {
  schemaVersion: number;
  project: { id: string; title: string };
  brief: Record<string, unknown>;
  scene: Record<string, unknown>;
  sceneFingerprint: string;
  lockedWindow: { sourceId: string; sourceStart: number; sourceEnd: number; mediaPlaybackRate: number };
  spec: { width: number; height: number; fps: number; durationSeconds: number; durationInFrames: number };
  referencedSources: Array<Record<string, unknown>>;
}
export interface CreativeShotArgs {
  help?: boolean;
  action?: 'prepare' | 'preview' | 'render' | 'inspect';
  brief?: string;
  scene?: string;
  entry?: string;
  composition?: string;
  workDir?: string;
  take?: string;
  duration?: number;
  frames?: number[];
}
export function parseCreativeShotArgs(args: string[]): CreativeShotArgs;
export function safeWorkspacePath(workspaceRoot: string, value: string, options?: { mustExist?: boolean; output?: boolean; kind?: 'file' | 'any' }): string;
export function sha256File(path: string): string;
export function creativeShotDependency(workspaceRoot: string, dependency: string): { path: string; sha256: string } | null;
export function creativeShotFingerprint(input: unknown): string;
export function buildCreativeShotInput(project: unknown, sceneId: string, durationSeconds?: number): CreativeShotInput;
export function resolvePreviewFrames(durationInFrames: number, additionalFrames?: number[]): number[];
export function prepareCreativeShot(options: { workspaceRoot: string; briefPath: string; sceneId: string; workDir?: string; take?: string; durationSeconds?: number }): { input: CreativeShotInput; inputFingerprint: string; canonicalPath: string; takeDir: string; effectiveDurationOverride?: number };
export function getCreativeShotReceiptStatus(receipt: { status: string; inputFingerprint: string; entrySha256?: string; artifacts?: Array<{ path: string; sha256: string }>; authoredDependencies?: Array<{ path: string; sha256: string }> }, currentInput: CreativeShotInput, currentEntrySha256?: string, artifactHashes?: Record<string, string>, dependencyHashes?: Record<string, string>): { status: string; staleReasons: string[]; semanticReview: string };
