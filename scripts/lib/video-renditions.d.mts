export interface VideoRendition {
  id: string;
  label: string;
  primary: boolean;
  aspectRatio: '9:16' | '16:9' | '1:1';
  width: number;
  height: number;
  mediaFit: 'contain' | 'cover';
  mediaBackground: 'solid' | 'blurred-fill';
  outputVideo: string;
  publicRender: string;
  workDir: string;
}

export function resolveProjectRenditions(project: unknown): VideoRendition[];
export function resolveProjectRendition(project: unknown, requestedId?: string): VideoRendition;
export function renditionBundleFingerprint(items: Array<{ id: string; videoSha256: string }>): string;
