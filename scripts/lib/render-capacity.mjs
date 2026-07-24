import { existsSync, statfsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

export const DEFAULT_RENDER_DISK_RESERVE_BYTES = 8 * GIB;
export const MINIMUM_RENDER_ESTIMATE_BYTES = 512 * MIB;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function configuredPositiveBytes(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function renderCapacityPolicy() {
  return {
    reserveBytes: configuredPositiveBytes(
      'VIDEOBRIEF_RENDER_DISK_RESERVE_BYTES',
      DEFAULT_RENDER_DISK_RESERVE_BYTES,
    ),
  };
}

export function estimateRenderWorkspaceBytes({
  durationSeconds,
  width,
  height,
  fps,
  sceneCount,
  renderStrategy = 'segmented-concat',
  publicRender = true,
}) {
  const duration = Math.max(1, Number(durationSeconds) || 0);
  const normalizedWidth = Math.max(1, Number(width) || 1920);
  const normalizedHeight = Math.max(1, Number(height) || 1080);
  const normalizedFps = Math.max(1, Number(fps) || 30);
  const normalizedScenes = Math.max(1, Math.floor(Number(sceneCount) || 0));
  const pixelRateRatio = normalizedWidth * normalizedHeight * normalizedFps / (1920 * 1080 * 30);
  const estimatedVideoBitrate = clamp(8_000_000 * pixelRateRatio, 4_000_000, 20_000_000);
  const encodedProgramBytes = duration * estimatedVideoBitrate / 8;
  const encodedCopies = (renderStrategy === 'segmented-concat' ? 4 : 3) + (publicRender ? 1 : 0);
  const encodedVideoBytes = encodedProgramBytes * encodedCopies;
  const audioAndVoiceBytes = duration * 48_000 * 2 * 5;
  const proofAndMetadataBytes = normalizedScenes * 3 * 2 * MIB;
  const subtotalBytes = encodedVideoBytes + audioAndVoiceBytes + proofAndMetadataBytes;
  const estimatedBytes = Math.max(
    MINIMUM_RENDER_ESTIMATE_BYTES,
    Math.ceil(subtotalBytes * 1.25),
  );
  return {
    estimatedBytes,
    durationSeconds: duration,
    estimatedVideoBitrate,
    encodedCopies,
    encodedVideoBytes: Math.ceil(encodedVideoBytes),
    audioAndVoiceBytes: Math.ceil(audioAndVoiceBytes),
    proofAndMetadataBytes: Math.ceil(proofAndMetadataBytes),
    safetyFactor: 1.25,
  };
}

export function validateRenderCapacity({ freeBytes, estimatedBytes, reserveBytes }) {
  const normalizedFree = Number(freeBytes);
  const normalizedEstimate = Number(estimatedBytes);
  const normalizedReserve = Number(reserveBytes);
  const remainingBytes = normalizedFree - normalizedEstimate;
  const passed = Number.isFinite(normalizedFree)
    && Number.isFinite(normalizedEstimate)
    && Number.isFinite(normalizedReserve)
    && normalizedFree > 0
    && normalizedEstimate > 0
    && normalizedReserve > 0
    && remainingBytes >= normalizedReserve;
  return {
    passed,
    freeBytes: normalizedFree,
    estimatedBytes: normalizedEstimate,
    reserveBytes: normalizedReserve,
    remainingBytes,
    issues: passed ? [] : [
      `渲染磁盘空间不足：预计新增 ${(normalizedEstimate / GIB).toFixed(2)} GiB，`
      + `完成后必须至少保留 ${(normalizedReserve / GIB).toFixed(2)} GiB，`
      + `当前可用 ${(normalizedFree / GIB).toFixed(2)} GiB。`,
    ],
  };
}

function nearestExistingDirectory(path) {
  let current = resolve(path);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) throw new Error(`Cannot find an existing parent directory for ${path}.`);
    current = parent;
  }
  return current;
}

export function assertRenderCapacity(directory, input) {
  const capacityDirectory = nearestExistingDirectory(directory);
  const stats = statfsSync(capacityDirectory, { bigint: true });
  const freeBytes = Number(stats.bavail * stats.bsize);
  const estimate = estimateRenderWorkspaceBytes(input);
  const policy = renderCapacityPolicy();
  const validation = validateRenderCapacity({ freeBytes, estimatedBytes: estimate.estimatedBytes, ...policy });
  if (!validation.passed) throw new Error(validation.issues.join(' '));
  return {
    checkedAt: new Date().toISOString(),
    directory: capacityDirectory,
    ...validation,
    estimate,
  };
}
