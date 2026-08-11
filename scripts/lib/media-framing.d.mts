export interface MediaFramingScene {
  mediaFit?: 'contain' | 'cover';
  mediaBackground?: 'solid' | 'blurred-fill';
  mediaFocalX?: number;
  mediaFocalY?: number;
}

export interface ResolvedMediaFraming {
  fit: 'contain' | 'cover';
  background: 'solid' | 'blurred-fill';
  focalX: number;
  focalY: number;
  filter: string;
  backgroundFilter?: string;
  foregroundFilter?: string;
  overlayFilter?: string;
}

export function resolveMediaFraming(input: {
  scene?: MediaFramingScene;
  projectFit?: 'contain' | 'cover';
  projectBackground?: 'solid' | 'blurred-fill';
  width: number;
  height: number;
}): ResolvedMediaFraming;
