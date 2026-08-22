export interface SceneTimingInput {
  sceneId: string;
  sourceType?: string;
  sourceStart?: number;
  sourceEnd?: number;
  mediaPlaybackRate?: number;
  voiceDuration: number;
  fps?: number;
}

export class SceneTimingError extends Error {
  readonly code: 'SCENE_TIMING_INVALID';
}

export interface SceneTimingResult {
  sourceStart: number;
  sourceEnd: number;
  renderSourceEnd: number | null;
  duration: number;
  frameCount: number;
  selectedDuration: number;
  mediaPlaybackRate: number;
}

export function resolveSceneTiming(input: SceneTimingInput): SceneTimingResult;
