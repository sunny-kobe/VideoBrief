import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { acquireRenderLock } from '../src/renderLock';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-render-lock-'));
  return join(root, 'render.lock');
}

test('does not reclaim a live render lock even after thirty minutes', () => {
  const path = fixture();
  const started = new Date('2026-07-22T00:00:00.000Z');
  const first = acquireRenderLock(path, 'project-a', {
    ownerPid: 111,
    now: () => started,
    isProcessAlive: (pid) => pid === 111,
  });
  assert.ok(first);

  const later = new Date('2026-07-22T02:00:00.000Z');
  const second = acquireRenderLock(path, 'project-b', {
    ownerPid: 222,
    now: () => later,
    isProcessAlive: (pid) => pid === 111,
  });
  assert.equal(second, null);
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).projectId, 'project-a');
});

test('recovers a lock whose owner process is no longer alive', () => {
  const path = fixture();
  writeFileSync(path, '111\n2026-07-20T00:00:00.000Z\n');
  const next = acquireRenderLock(path, 'project-b', {
    ownerPid: 222,
    isProcessAlive: () => false,
  });
  assert.ok(next);
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).projectId, 'project-b');
});

test('does not reclaim a recent malformed lock', () => {
  const path = fixture();
  writeFileSync(path, 'partially-written-lock');
  const next = acquireRenderLock(path, 'project-b', {
    ownerPid: 222,
    now: () => new Date(),
    isProcessAlive: () => false,
  });
  assert.equal(next, null);
});

test('recovers an old malformed lock after the recovery grace period', () => {
  const path = fixture();
  writeFileSync(path, 'partially-written-lock');
  const old = new Date('2026-07-20T00:00:00.000Z');
  utimesSync(path, old, old);
  const next = acquireRenderLock(path, 'project-b', {
    ownerPid: 222,
    now: () => new Date('2026-07-22T00:00:00.000Z'),
    isProcessAlive: () => false,
  });
  assert.ok(next);
});

test('an old owner cannot release a lock acquired by a newer task', () => {
  const path = fixture();
  const first = acquireRenderLock(path, 'project-a', {
    ownerPid: 111,
    isProcessAlive: () => false,
  });
  assert.ok(first);
  const firstRecord = JSON.parse(readFileSync(path, 'utf8'));
  writeFileSync(path, JSON.stringify({ ...firstRecord, token: 'new-owner', projectId: 'project-b' }));
  assert.equal(first.release(), false);
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).projectId, 'project-b');
});

test('transfers lock liveness ownership to the render child process', () => {
  const path = fixture();
  const lock = acquireRenderLock(path, 'project-a', {
    ownerPid: 111,
    isProcessAlive: () => true,
  });
  assert.ok(lock);
  assert.equal(lock.transferOwnership(333), true);
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).ownerPid, 333);
});
