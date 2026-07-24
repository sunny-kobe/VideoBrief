import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  acquireSourceProcessingQueueWorker,
  cancelSourceProcessingJob,
  claimNextSourceProcessingJob,
  enqueueSourceProcessingJob,
  listSourceProcessingJobs,
} from '../src/sourceProcessingQueue';

function queuePath() {
  return join(mkdtempSync(join(tmpdir(), 'videobrief-source-queue-')), 'queue.json');
}

test('source processing queue deduplicates one project source and preserves FIFO order', () => {
  const path = queuePath();
  const first = enqueueSourceProcessingJob(path, {
    projectId: 'project-a',
    sourceId: 'source-01',
    briefPath: '/tmp/project-a.json',
  });
  const duplicate = enqueueSourceProcessingJob(path, {
    projectId: 'project-a',
    sourceId: 'source-01',
    briefPath: '/tmp/project-a.json',
  });
  enqueueSourceProcessingJob(path, {
    projectId: 'project-a',
    sourceId: 'source-02',
    briefPath: '/tmp/project-a.json',
  });

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(first.job.jobId, duplicate.job.jobId);
  assert.deepEqual(listSourceProcessingJobs(path).map((job) => job.queuePosition), [1, 2]);
  assert.equal(acquireSourceProcessingQueueWorker(path, 1234, { isProcessAlive: () => false }), true);
  assert.equal(claimNextSourceProcessingJob(path, 1234)?.sourceId, 'source-01');
});

test('source processing queue cancels a queued source without disturbing the next source', () => {
  const path = queuePath();
  const first = enqueueSourceProcessingJob(path, {
    projectId: 'project-a',
    sourceId: 'source-01',
    briefPath: '/tmp/project-a.json',
  });
  enqueueSourceProcessingJob(path, {
    projectId: 'project-a',
    sourceId: 'source-02',
    briefPath: '/tmp/project-a.json',
  });

  assert.equal(cancelSourceProcessingJob(path, first.job.jobId)?.state, 'cancelled');
  const jobs = listSourceProcessingJobs(path);
  assert.deepEqual(jobs.map((job) => job.state), ['cancelled', 'queued']);
  assert.equal(jobs[1].queuePosition, 1);
});

test('a new source worker requeues a job whose worker and child are dead', () => {
  const path = queuePath();
  enqueueSourceProcessingJob(path, {
    projectId: 'project-a',
    sourceId: 'source-01',
    briefPath: '/tmp/project-a.json',
  });
  assert.equal(acquireSourceProcessingQueueWorker(path, 111, { isProcessAlive: () => false }), true);
  assert.ok(claimNextSourceProcessingJob(path, 111));
  assert.equal(acquireSourceProcessingQueueWorker(path, 222, { isProcessAlive: () => false }), true);
  const [requeued] = listSourceProcessingJobs(path);
  assert.equal(requeued.state, 'queued');
  assert.equal(requeued.workerPid, undefined);
});
