export interface MediaMotionScene {
  mediaMotion?: 'none' | 'push-in' | 'pull-out';
  mediaMotionAmount?: number;
  mediaFocalX?: number;
  mediaFocalY?: number;
}

export interface ResolvedMediaMotion {
  mode: 'none' | 'push-in' | 'pull-out';
  amount: number;
  filter: string;
}

export function resolveMediaMotion(input: {
  scene?: MediaMotionScene;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
}): ResolvedMediaMotion;
