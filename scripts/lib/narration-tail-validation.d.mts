export interface NarrationTailScene {
  id?: string;
  start?: number;
  end?: number;
  duration?: number;
  speechDuration?: number;
}

export interface NarrationTailCheck {
  sceneId: string;
  duration: number;
  speechDuration: number;
  tailSeconds: number;
  maximumTailSeconds: number;
  passed: boolean;
}

export const MAX_NARRATION_TAIL_SECONDS: number;

export function inspectNarrationTailGaps(
  scenes: NarrationTailScene[],
  maximumTailSeconds?: number,
): {
  maximumTailSeconds: number;
  checks: NarrationTailCheck[];
  excessive: NarrationTailCheck[];
};
