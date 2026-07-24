import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

import {
  registerRenderProcess,
  renderCancellationRequested,
  requestRenderCancellation,
  signalProcessTree,
  unregisterRenderProcess,
} from '../src/renderProcessRegistry';

test('signals the entire detached process group on Unix', () => {
  const calls: Array<[number, NodeJS.Signals]> = [];
  const sent = signalProcessTree(321, 'SIGTERM', 'darwin', (pid, signal) => {
    calls.push([pid, signal]);
    return true;
  });
  assert.equal(sent, true);
  assert.deepEqual(calls, [[-321, 'SIGTERM']]);
});

test('falls back to the child pid when its Unix process group is unavailable', () => {
  const calls: number[] = [];
  const sent = signalProcessTree(321, 'SIGTERM', 'darwin', (pid) => {
    calls.push(pid);
    if (pid < 0) throw new Error('missing process group');
    return true;
  });
  assert.equal(sent, true);
  assert.deepEqual(calls, [-321, 321]);
});

test('signals only the child pid on Windows', () => {
  const calls: number[] = [];
  signalProcessTree(321, 'SIGTERM', 'win32', (pid) => {
    calls.push(pid);
    return true;
  });
  assert.deepEqual(calls, [321]);
});

test('a cancellation request terminates a real detached render process', async () => {
  const projectId = `cancel-test-${process.pid}`;
  const jobId = 'job-1';
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: process.platform !== 'win32',
    stdio: 'ignore',
  });
  registerRenderProcess(projectId, jobId, child);
  try {
    assert.equal(requestRenderCancellation(projectId, jobId), true);
    assert.equal(renderCancellationRequested(projectId, jobId), true);
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    assert.equal(result.code, null);
    assert.equal(result.signal, 'SIGTERM');
  } finally {
    unregisterRenderProcess(projectId, jobId);
    if (child.pid) signalProcessTree(child.pid, 'SIGKILL');
  }
});
