import type {
  ProjectMaterialQualityReview,
  ShortVideoProject,
  ShortVideoProjectScene,
} from '../../src/shortVideoBrief';

export function materialQualitySceneFingerprint(
  project: ShortVideoProject,
  scene: ShortVideoProjectScene,
): string;

export function materialQualityGateReadiness(project: ShortVideoProject): {
  ready: boolean;
  required: boolean;
  issues: string[];
  reviewedSceneCount: number;
};

export function buildMaterialQualityReview(
  project: ShortVideoProject,
  report: unknown,
  reviewer: string,
  reviewedAt?: string,
): ProjectMaterialQualityReview;
