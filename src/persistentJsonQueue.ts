import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

const LOCK_RECOVERY_GRACE_MS = 30_000;
const LOCK_WAIT_MS = 5_000;

export function isProcessAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error instanceof Error && 'code' in error && error.code === 'EPERM');
  }
}

export function writeAtomicJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  renameSync(temporaryPath, path);
}

function sleep(milliseconds: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function readLockOwner(path: string) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as { pid?: number };
    return Number.isInteger(value.pid) ? Number(value.pid) : null;
  } catch {
    return null;
  }
}

export function withJsonFileLock<T>(path: string, action: () => T): T {
  const lockPath = `${path}.lock`;
  mkdirSync(dirname(path), { recursive: true });
  const startedAt = Date.now();
  let descriptor: number | null = null;
  while (descriptor == null) {
    try {
      descriptor = openSync(lockPath, 'wx');
      writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`);
      closeSync(descriptor);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      const ownerPid = readLockOwner(lockPath);
      const lockAge = Date.now() - statSync(lockPath).mtimeMs;
      if ((ownerPid && !isProcessAlive(ownerPid)) || (!ownerPid && lockAge > LOCK_RECOVERY_GRACE_MS)) {
        try {
          unlinkSync(lockPath);
        } catch (unlinkError) {
          if (!(unlinkError instanceof Error && 'code' in unlinkError && unlinkError.code === 'ENOENT')) {
            throw unlinkError;
          }
        }
        continue;
      }
      if (Date.now() - startedAt >= LOCK_WAIT_MS) {
        throw new Error(`Timed out waiting for queue lock: ${lockPath}`);
      }
      sleep(20);
    }
  }

  try {
    return action();
  } finally {
    try {
      unlinkSync(lockPath);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
}

export function readJsonFile<T>(
  path: string,
  fallback: () => T,
  validate: (value: unknown) => T,
) {
  if (!existsSync(path)) return fallback();
  return validate(JSON.parse(readFileSync(path, 'utf8')));
}
