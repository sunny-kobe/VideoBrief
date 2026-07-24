export const SEGMENT_RENDERER_VERSION: string;

export function stableJson(value: unknown): string;

export function segmentRenderCacheKey(descriptor: unknown): string;

export function segmentCacheIsReusable(
  metadata: unknown,
  cacheKey: string,
  segmentSha256: string,
): boolean;
