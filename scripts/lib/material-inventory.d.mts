import type { ShortVideoProject } from '../../src/shortVideoBrief';

export interface MaterialInventoryWindow {
  sceneId: string;
  sceneTitle: string;
  visualRequirement: string;
  narration: string;
  candidateId: string;
  sourceStart: number;
  sourceEnd: number;
  matchReason: string;
  rightsStatus: string;
  selected: boolean;
  selectionStatus: string;
}

export interface MaterialInventorySource {
  id: string;
  label: string;
  sourceType: string;
  materialRole: string;
  originalFileName: string;
  originUrl: string;
  assetPath: string;
  verificationStatus: string;
  rightsStatus: string;
  rightsNote: string;
  contentHash: string;
  reusedFrom: ShortVideoProject['sources'][number]['reusedFrom'];
  processingStatus: string;
  facts: ShortVideoProject['research']['facts'];
  uncertainties: ShortVideoProject['research']['uncertainties'];
  plannedWindows: MaterialInventoryWindow[];
}

export function materialInventorySources(project: ShortVideoProject): MaterialInventorySource[];
export function buildMaterialInventory(project: ShortVideoProject): {
  schemaVersion: 1;
  projectId: string;
  materialReview: ShortVideoProject['materialReview'];
  sources: MaterialInventorySource[];
};
