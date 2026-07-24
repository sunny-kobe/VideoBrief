export const MIN_PROJECT_DURATION_SECONDS: number;
export const MAX_PROJECT_DURATION_SECONDS: number;
export const LONG_FORM_THRESHOLD_SECONDS: number;
export const LONG_FORM_MIN_DURATION_RATIO: number;
export const LONG_FORM_MAX_DURATION_RATIO: number;

export interface ProjectTargetDurationValidation {
  passed: boolean;
  targetDurationSeconds: number;
  issues: string[];
}

export interface RenderedDurationValidation extends ProjectTargetDurationValidation {
  applies: boolean;
  renderedDurationSeconds: number;
  minimumDurationSeconds: number | null;
  maximumDurationSeconds: number | null;
}

export function validateProjectTargetDuration(value: unknown): ProjectTargetDurationValidation;
export function validateRenderedDuration(
  targetValue: unknown,
  renderedValue: unknown,
): RenderedDurationValidation;
export function assertProjectTargetDuration(value: unknown): number;
export function assertRenderedDuration(
  targetValue: unknown,
  renderedValue: unknown,
): RenderedDurationValidation;
