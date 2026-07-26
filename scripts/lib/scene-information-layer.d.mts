export interface SceneInformationLayerPlanItem {
  sceneId: string;
  index: number;
  title: string;
  subtitle: string;
  narration: string;
  visualRequirement: string;
  visualKind: 'brief' | 'evidence' | 'approval' | 'proof' | 'statuses' | 'flow';
  sourceStart: number;
  sourceEnd: number;
  matchReason: string;
  rightsStatus: 'cleared';
  showEditorialOverlay: false;
}

export function sceneInformationVisualKind(scene: Record<string, unknown>): SceneInformationLayerPlanItem['visualKind'];
export function buildSceneInformationLayerPlan(
  project: {
    brief?: { targetDurationSeconds?: number };
    scenes?: Array<Record<string, unknown>>;
  },
  segmentDurationSeconds?: number,
): SceneInformationLayerPlanItem[];
