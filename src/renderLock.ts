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

export interface RenderLockRecord {
  schemaVersion: 1;
  token: string;
  ownerPid: number;
  projectId: string;
  acquiredAt: string;
  heartbeatAt: string;
}

export interface RenderLockHandle {
  record: RenderLockRecord;
  heartbeat: () => boolean;
  transferOwnership: (ownerPid: number) => boolean;
  release: () => boolean;
}

interface RenderLockOptions {
  ownerPid?: number;
  now?: () => Date;
  isProcessAlive?: (pid: number) => boolean;
  malformedLockGraceMs?: number;
}

const DEFAULT_MALFORMED_LOCK_GRACE_MS = 24 * 60 * 60 * 1000;

function defaultIsProcessAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(
      error instanceof Error
      && 'code' in error
      && error.code === 'EPERM',
    );
  }
}

function parseRenderLock(text: string): RenderLockRecord | { ownerPid: number } | null {
  try {
    const value = JSON.parse(text) as Partial<RenderLockRecord>;
    if (
      value.schemaVersion === 1
      && typeof value.token === 'string'
      && Number.isInteger(value.ownerPid)
      && typeof value.projectId === 'string'
      && typeof value.acquiredAt === 'string'
      && typeof value.heartbeatAt === 'string'
    ) return value as RenderLockRecord;
  } catch {
    const [legacyPid] = text.trim().split(/\r?\n/);
    const ownerPid = Number(legacyPid);
    if (Number.isInteger(ownerPid) && ownerPid > 0) return { ownerPid };
  }
  return null;
}

function readLock(path: string) {
  if (!existsSync(path)) return null;
  try {
    return parseRenderLock(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function lockOwnedBy(path: string, token: string) {
  const current = readLock(path);
  return current !== null && 'token' in current && current.token === token;
}

function writeOwnedLock(path: string, record: RenderLockRecord) {
  if (!lockOwnedBy(path, record.token)) return false;
  const temporaryPath = `${path}.${record.token}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(record)}\n`, { flag: 'wx' });
  renameSync(temporaryPath, path);
  return true;
}

export function acquireRenderLock(
  path: string,
  projectId: string,
  options: RenderLockOptions = {},
): RenderLockHandle | null {
  const now = options.now ?? (() => new Date());
  const ownerPid = options.ownerPid ?? process.pid;
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  const malformedLockGraceMs = options.malformedLockGraceMs ?? DEFAULT_MALFORMED_LOCK_GRACE_MS;
  mkdirSync(dirname(path), { recursive: true });

  if (existsSync(path)) {
    const existing = readLock(path);
    if (existing && isProcessAlive(existing.ownerPid)) return null;
    if (!existing && now().getTime() - statSync(path).mtimeMs <= malformedLockGraceMs) return null;
    try {
      unlinkSync(path);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // Another contender already recovered the stale lock.
      } else {
        throw error;
      }
    }
  }

  const timestamp = now().toISOString();
  const record: RenderLockRecord = {
    schemaVersion: 1,
    token: randomUUID(),
    ownerPid,
    projectId,
    acquiredAt: timestamp,
    heartbeatAt: timestamp,
  };

  try {
    const descriptor = openSync(path, 'wx');
    writeFileSync(descriptor, `${JSON.stringify(record)}\n`);
    closeSync(descriptor);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') return null;
    throw error;
  }

  return {
    record,
    heartbeat() {
      const next = { ...record, heartbeatAt: now().toISOString() };
      const updated = writeOwnedLock(path, next);
      if (updated) record.heartbeatAt = next.heartbeatAt;
      return updated;
    },
    transferOwnership(nextOwnerPid) {
      if (!Number.isInteger(nextOwnerPid) || nextOwnerPid <= 0) return false;
      const next = {
        ...record,
        ownerPid: nextOwnerPid,
        heartbeatAt: now().toISOString(),
      };
      const updated = writeOwnedLock(path, next);
      if (updated) {
        record.ownerPid = next.ownerPid;
        record.heartbeatAt = next.heartbeatAt;
      }
      return updated;
    },
    release() {
      if (!lockOwnedBy(path, record.token)) return false;
      unlinkSync(path);
      return true;
    },
  };
}
