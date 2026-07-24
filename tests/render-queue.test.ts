import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  acquireRenderQueueWorker,
  cancelRenderQueueJob,
  claimNextRenderQueueJob,
  enqueueRenderQueueJob,
  heartbeatRenderQueueWorker,
  listRenderQueueJobs,
  releaseRenderQueueWorker,
  updateRenderQueueJob,
} from '../src/renderQueue';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-render-queue-'));
  return join(root, 'queue.json');
}

function enqueue(path: string, projectId: string, second: number) {
  return enqueueRenderQueueJob(path, {
    projectId,
    briefPath: `/projects/${projectId}/project.json`,
  }, {
    now: () => new Date(`2026-07-22T00:00:${String(second).padStart(2, '0')}.000Z`),
  });
}

test('claims queued render jobs in FIFO order', () => {
  const path = fixture();
  const first = enqueue(path, 'project-a', 1);
  const second = enqueue(path, 'project-b', 2);

  assert.equal(first.created, true);
  assert.equal(second.created, true);
  const firstClaim = claimNextRenderQueueJob(path, 700);
  assert.equal(firstClaim?.projectId, 'project-a');
  assert.equal(claimNextRenderQueueJob(path, 700), null);
  updateRenderQueueJob(path, firstClaim!.jobId, {
    state: 'completed',
    stage: 'completed',
    completedAt: '2026-07-22T00:00:03.000Z',
  });
  assert.equal(claimNextRenderQueueJob(path, 700)?.projectId, 'project-b');
});

test('deduplicates active jobs for the same project', () => {
  const path = fixture();
  const first = enqueue(path, 'project-a', 1);
  const duplicate = enqueue(path, 'project-a', 2);

  assert.equal(duplicate.created, false);
  assert.equal(duplicate.job.jobId, first.job.jobId);
  assert.equal(listRenderQueueJobs(path).length, 1);
});

test('cancels a queued job without affecting FIFO order', () => {
  const path = fixture();
  const first = enqueue(path, 'project-a', 1);
  enqueue(path, 'project-b', 2);

  const cancelled = cancelRenderQueueJob(path, first.job.jobId);
  assert.equal(cancelled?.state, 'cancelled');
  assert.equal(claimNextRenderQueueJob(path, 700)?.projectId, 'project-b');
});

test('a new worker requeues a running job whose worker and child are dead', () => {
  const path = fixture();
  enqueue(path, 'project-a', 1);
  assert.equal(acquireRenderQueueWorker(path, 700, { isProcessAlive: () => false }), true);
  const running = claimNextRenderQueueJob(path, 700);
  assert.equal(running?.state, 'running');

  assert.equal(acquireRenderQueueWorker(path, 701, { isProcessAlive: () => false }), true);
  const [recovered] = listRenderQueueJobs(path);
  assert.equal(recovered.state, 'queued');
  assert.equal(recovered.workerPid, undefined);
  assert.equal(recovered.processId, undefined);
});

test('a new worker adopts a running job while its render child is alive', () => {
  const path = fixture();
  enqueue(path, 'project-a', 1);
  assert.equal(acquireRenderQueueWorker(path, 700, { isProcessAlive: () => false }), true);
  const running = claimNextRenderQueueJob(path, 700, { processId: 900 });
  assert.equal(running?.processId, 900);

  assert.equal(acquireRenderQueueWorker(path, 701, {
    isProcessAlive: (pid) => pid === 900,
  }), true);
  const [adopted] = listRenderQueueJobs(path);
  assert.equal(adopted.state, 'running');
  assert.equal(adopted.workerPid, 701);
  assert.equal(adopted.processId, 900);
});

test('only the owning live worker can heartbeat and release its lease', () => {
  const path = fixture();
  assert.equal(acquireRenderQueueWorker(path, 700, { isProcessAlive: () => false }), true);
  assert.equal(heartbeatRenderQueueWorker(path, 701), false);
  assert.equal(releaseRenderQueueWorker(path, 701), false);
  assert.equal(heartbeatRenderQueueWorker(path, 700), true);
  assert.equal(releaseRenderQueueWorker(path, 700), true);
});

test('a worker cannot release its lease while a queued job exists', () => {
  const path = fixture();
  assert.equal(acquireRenderQueueWorker(path, 700, { isProcessAlive: () => false }), true);
  enqueue(path, 'project-a', 1);
  assert.equal(releaseRenderQueueWorker(path, 700), false);
  assert.equal(claimNextRenderQueueJob(path, 700)?.projectId, 'project-a');
});
