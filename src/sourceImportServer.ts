import { createHash, randomUUID } from 'node:crypto';
import {
  createWriteStream,
  mkdirSync,
  statfsSync,
} from 'node:fs';
import { rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const GIB = 1024 ** 3;

export const DEFAULT_MAX_SOURCE_BYTES = 20 * GIB;
export const DEFAULT_DISK_RESERVE_BYTES = 4 * GIB;

function configuredPositiveBytes(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function sourceImportLimits() {
  return {
    maxBytes: configuredPositiveBytes('VIDEOBRIEF_MAX_SOURCE_BYTES', DEFAULT_MAX_SOURCE_BYTES),
    reserveBytes: configuredPositiveBytes('VIDEOBRIEF_DISK_RESERVE_BYTES', DEFAULT_DISK_RESERVE_BYTES),
  };
}

export function validateSourceImportCapacity({
  declaredBytes,
  freeBytes,
  maxBytes,
  reserveBytes,
}: {
  declaredBytes: number;
  freeBytes: number;
  maxBytes: number;
  reserveBytes: number;
}) {
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes <= 0) {
    throw new Error('上传文件为空或文件大小无效。');
  }
  if (declaredBytes > maxBytes) {
    throw new Error(`单个素材不能超过 ${(maxBytes / GIB).toFixed(1)} GB。`);
  }
  if (freeBytes - declaredBytes < reserveBytes) {
    throw new Error(
      `磁盘空间不足：导入后必须至少保留 ${(reserveBytes / GIB).toFixed(1)} GB 可用空间。`,
    );
  }
}

export function assertSourceImportCapacity(directory: string, declaredBytes: number) {
  mkdirSync(directory, { recursive: true });
  const stats = statfsSync(directory, { bigint: true });
  const freeBytes = Number(stats.bavail * stats.bsize);
  const limits = sourceImportLimits();
  validateSourceImportCapacity({ declaredBytes, freeBytes, ...limits });
  return { freeBytes, ...limits };
}

export async function writeSourceStreamAtomically({
  chunks,
  destinationPath,
  expectedBytes,
  maxBytes,
}: {
  chunks: AsyncIterable<Uint8Array>;
  destinationPath: string;
  expectedBytes: number;
  maxBytes: number;
}) {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) {
    throw new Error('上传文件为空或文件大小无效。');
  }

  mkdirSync(dirname(destinationPath), { recursive: true });
  const temporaryPath = `${destinationPath}.uploading-${randomUUID()}`;
  const hash = createHash('sha256');
  let bytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes || bytes > expectedBytes) {
        callback(new Error('上传内容超过声明大小或素材大小上限。'));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.from(chunks),
      meter,
      createWriteStream(temporaryPath, { flags: 'wx' }),
    );
    if (bytes !== expectedBytes) {
      throw new Error(`上传不完整：收到 ${bytes} 字节，预期 ${expectedBytes} 字节。`);
    }
    await rename(temporaryPath, destinationPath);
    return { bytes, contentHash: hash.digest('hex') };
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
