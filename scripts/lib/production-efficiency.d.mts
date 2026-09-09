export function measuredNumber(value: unknown): number | null;
export interface EfficiencySample {
  projectId: string;
  renderedAt: string | null;
  format: string;
  strategy: string;
  cacheMode: string;
  sceneCount: number | null;
  cacheHitRatio: number | null;
  durationSeconds: number | null;
  renderMs: number | null;
  technicalProofMs: number | null;
  renderSecondsPerVideoSecond: number | null;
  recordedProofPassed: boolean;
}
export function efficiencySample(project: Record<string, any>, manifest: Record<string, any>): EfficiencySample;
export interface Distribution {
  measured: number;
  missing: number;
  median: number | null;
  p90: number | null;
}
export function distribution(values: unknown[]): Distribution;
export function summarizeEfficiencySamples(samples: EfficiencySample[]): {
  group: string;
  samples: number;
  renderMs: Distribution;
  technicalProofMs: Distribution;
  renderSecondsPerVideoSecond: Distribution;
}[];
export function renderEfficiencySummary(report: Record<string, any>): string;
