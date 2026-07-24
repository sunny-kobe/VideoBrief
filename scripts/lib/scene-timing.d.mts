export interface SceneTimingInput {
  sceneId: string;
  sourceType?: string;
  sourceStart?: number;
  sourceEnd?: number;
  voiceDuration: number;
  fps?: number;
}

export interface SceneTimingResult {
  sourceStart: number;
  sourceEnd: number;
  renderSourceEnd: number | null;
  duration: number;
  frameCount: number;
  selectedDuration: number;
}

export function resolveSceneTiming(input: SceneTimingInput): SceneTimingResult;
