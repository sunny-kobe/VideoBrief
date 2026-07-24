import { createHash } from 'node:crypto';

export const SEGMENT_RENDERER_VERSION = 'videobrief-segment-v4';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

export function segmentRenderCacheKey(descriptor) {
  return createHash('sha256')
    .update(stableJson({ rendererVersion: SEGMENT_RENDERER_VERSION, ...descriptor }))
    .digest('hex');
}

export function segmentCacheIsReusable(metadata, cacheKey, segmentSha256) {
  return metadata?.schemaVersion === 1
    && metadata.rendererVersion === SEGMENT_RENDERER_VERSION
    && metadata.cacheKey === cacheKey
    && /^[a-f0-9]{64}$/.test(String(metadata.segmentSha256 ?? ''))
    && metadata.segmentSha256 === segmentSha256;
}
