export interface RenderCapacityEstimateInput {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  sceneCount: number;
  renderStrategy?: 'segmented-concat' | 'monolithic';
  publicRender?: boolean;
}

export interface RenderCapacityEstimate {
  estimatedBytes: number;
  durationSeconds: number;
  estimatedVideoBitrate: number;
  encodedCopies: number;
  encodedVideoBytes: number;
  audioAndVoiceBytes: number;
  proofAndMetadataBytes: number;
  safetyFactor: number;
}

export interface RenderCapacityValidation {
  passed: boolean;
  freeBytes: number;
  estimatedBytes: number;
  reserveBytes: number;
  remainingBytes: number;
  issues: string[];
}

export const DEFAULT_RENDER_DISK_RESERVE_BYTES: number;
export const MINIMUM_RENDER_ESTIMATE_BYTES: number;
export function renderCapacityPolicy(): { reserveBytes: number };
export function estimateRenderWorkspaceBytes(input: RenderCapacityEstimateInput): RenderCapacityEstimate;
export function validateRenderCapacity(input: {
  freeBytes: number;
  estimatedBytes: number;
  reserveBytes: number;
}): RenderCapacityValidation;
export function assertRenderCapacity(
  directory: string,
  input: RenderCapacityEstimateInput,
): RenderCapacityValidation & {
  checkedAt: string;
  directory: string;
  estimate: RenderCapacityEstimate;
};
