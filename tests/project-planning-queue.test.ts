import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  acquireProjectPlanningQueueWorker,
  cancelProjectPlanningJob,
  claimNextProjectPlanningJob,
  enqueueProjectPlanningJob,
  listProjectPlanningJobs,
} from '../src/projectPlanningQueue';

function queuePath() {
  return join(mkdtempSync(join(tmpdir(), 'videobrief-planning-queue-')), 'queue.json');
}

test('project planning queue deduplicates a project and preserves FIFO order', () => {
  const path = queuePath();
  const first = enqueueProjectPlanningJob(path, {
    projectId: 'project-a', briefPath: '/tmp/project-a.json', instruction: 'first',
  });
  const duplicate = enqueueProjectPlanningJob(path, {
    projectId: 'project-a', briefPath: '/tmp/project-a.json', instruction: 'changed',
  });
  enqueueProjectPlanningJob(path, {
    projectId: 'project-b', briefPath: '/tmp/project-b.json', instruction: '',
  });

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.job.jobId, first.job.jobId);
  assert.equal(duplicate.job.instruction, 'first');
  assert.deepEqual(listProjectPlanningJobs(path).map((job) => job.queuePosition), [1, 2]);
  assert.equal(acquireProjectPlanningQueueWorker(path, 700, { isProcessAlive: () => false }), true);
  assert.equal(claimNextProjectPlanningJob(path, 700)?.projectId, 'project-a');
});

test('project planning queue supports queued cancellation and dead-worker recovery', () => {
  const path = queuePath();
  const first = enqueueProjectPlanningJob(path, {
    projectId: 'project-a', briefPath: '/tmp/project-a.json', instruction: '',
  });
  enqueueProjectPlanningJob(path, {
    projectId: 'project-b', briefPath: '/tmp/project-b.json', instruction: '',
  });
  assert.equal(cancelProjectPlanningJob(path, first.job.jobId)?.state, 'cancelled');
  assert.equal(listProjectPlanningJobs(path)[1].queuePosition, 1);

  assert.equal(acquireProjectPlanningQueueWorker(path, 701, { isProcessAlive: () => false }), true);
  assert.equal(claimNextProjectPlanningJob(path, 701)?.projectId, 'project-b');
  assert.equal(acquireProjectPlanningQueueWorker(path, 702, { isProcessAlive: () => false }), true);
  const recovered = listProjectPlanningJobs(path).at(-1)!;
  assert.equal(recovered.state, 'queued');
  assert.equal(recovered.workerPid, undefined);
  assert.equal(recovered.processId, undefined);
});
