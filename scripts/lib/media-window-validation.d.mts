export interface VideoWindowInput {
  sceneId: string;
  sourceDuration: number;
  sourceStart: number;
  sourceEnd: number;
}

export function validateVideoWindow(input: VideoWindowInput): {
  sourceDuration: number;
  sourceStart: number;
  sourceEnd: number;
};
