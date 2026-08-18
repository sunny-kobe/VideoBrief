import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  acquireSourceProcessingQueueWorker,
  cancelSourceProcessingJob,
  claimNextSourceProcessingJob,
  enqueueSourceProcessingJob,
  listSourceProcessingJobs,
  updateSourceProcessingJob,
} from '../src/sourceProcessingQueue';

async function waitUntil(check: () => boolean, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('Timed out waiting for source worker state.');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
}

function workerProcess(
  queuePath: string,
  processorPath: string,
  env: Record<string, string | undefined> = {},
  concurrency = 3,
) {
  return spawn(process.execPath, [
    '--import',
    'tsx',
    'scripts/source-processing-queue-worker.ts',
    `--queue=${queuePath}`,
    `--processor=${processorPath}`,
    `--concurrency=${concurrency}`,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: 'ignore',
  });
}

function waitForExit(child: ChildProcess, timeoutMs = 5_000) {
  return new Promise<void>((resolvePromise, reject) => {
    if (child.exitCode != null || child.signalCode != null) {
      resolvePromise();
      return;
    }
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Source worker did not exit in time.'));
    }, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });
}

test('standalone source worker drains sources in FIFO order and mirrors completion from canonical files', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-source-worker-'));
  const queuePath = join(root, 'queue.json');
  const logPath = join(root, 'source.log');
  const briefPath = join(root, 'project-a.json');
  writeFileSync(briefPath, JSON.stringify({
    id: 'project-a',
    sources: ['source-01', 'source-02'].map((id) => ({
      id,
      processing: { status: 'pending', stage: 'idle', error: '' },
    })),
  }));
  for (const sourceId of ['source-01', 'source-02']) {
    enqueueSourceProcessingJob(queuePath, { projectId: 'project-a', sourceId, briefPath });
  }

  execFileSync(process.execPath, [
    '--import',
    'tsx',
    'scripts/source-processing-queue-worker.ts',
    `--queue=${queuePath}`,
    `--processor=${resolve('tests/fixtures/fake-source-processor.mjs')}`,
    '--concurrency=1',
  ], {
    cwd: process.cwd(),
    env: { ...process.env, VIDEOBRIEF_FAKE_SOURCE_LOG: logPath },
  });

  assert.deepEqual(readFileSync(logPath, 'utf8').trim().split('\n'), ['source-01', 'source-02']);
  assert.deepEqual(listSourceProcessingJobs(queuePath).map((job) => job.state), ['completed', 'completed']);
  const project = JSON.parse(readFileSync(briefPath, 'utf8'));
  assert.ok(project.sources.every((source: { processing: { status: string } }) => source.processing.status === 'completed'));
});

test('source worker overlaps three jobs and preserves every canonical source update', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-source-worker-concurrent-'));
  const queuePath = join(root, 'queue.json');
  const eventPath = join(root, 'events.log');
  const briefPath = join(root, 'project-a.json');
  const sourceIds = ['source-01', 'source-02', 'source-03'];
  writeFileSync(briefPath, JSON.stringify({
    id: 'project-a',
    sources: sourceIds.map((id) => ({
      id,
      processing: { status: 'pending', stage: 'idle', error: '' },
    })),
  }));
  for (const sourceId of sourceIds) {
    enqueueSourceProcessingJob(queuePath, { projectId: 'project-a', sourceId, briefPath });
  }

  execFileSync(process.execPath, [
    '--import',
    'tsx',
    'scripts/source-processing-queue-worker.ts',
    `--queue=${queuePath}`,
    `--processor=${resolve('tests/fixtures/fake-source-processor.mjs')}`,
    '--concurrency=3',
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VIDEOBRIEF_FAKE_SOURCE_DELAY_MS: '300',
      VIDEOBRIEF_FAKE_SOURCE_EVENTS: eventPath,
    },
  });

  const events = readFileSync(eventPath, 'utf8').trim().split('\n').map((line) => {
    const [event, sourceId, timestamp] = line.split(' ');
    return { event, sourceId, timestamp: Number(timestamp) };
  });
  const starts = events.filter((event) => event.event === 'start');
  const firstEnd = Math.min(...events.filter((event) => event.event === 'end').map((event) => event.timestamp));
  assert.equal(starts.length, 3);
  assert.ok(starts.every((event) => event.timestamp < firstEnd));
  assert.deepEqual(listSourceProcessingJobs(queuePath).map((job) => job.state), [
    'completed',
    'completed',
    'completed',
  ]);
  const project = JSON.parse(readFileSync(briefPath, 'utf8'));
  assert.ok(project.sources.every((source: { processing: { status: string } }) => (
    source.processing.status === 'completed'
  )));
});

test('a running source child is terminated when its persisted job is cancelled', async () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-source-worker-cancel-'));
  const queuePath = join(root, 'queue.json');
  const briefPath = join(root, 'project-a.json');
  const processorPath = resolve('tests/fixtures/fake-source-processor.mjs');
  writeFileSync(briefPath, JSON.stringify({
    id: 'project-a',
    sources: ['source-01', 'source-02'].map((id) => ({
      id,
      processing: { status: 'pending', stage: 'idle', error: '' },
    })),
  }));
  const queued = enqueueSourceProcessingJob(queuePath, {
    projectId: 'project-a',
    sourceId: 'source-01',
    briefPath,
  });
  enqueueSourceProcessingJob(queuePath, {
    projectId: 'project-a',
    sourceId: 'source-02',
    briefPath,
  });
  const worker = workerProcess(queuePath, processorPath, {
    VIDEOBRIEF_FAKE_SOURCE_DELAY_MS: '1500',
  });
  try {
    await waitUntil(() => listSourceProcessingJobs(queuePath).every((job) => Boolean(job.processId)));
    assert.equal(cancelSourceProcessingJob(queuePath, queued.job.jobId)?.state, 'cancelling');
    await waitUntil(() => listSourceProcessingJobs(queuePath)[0]?.state === 'cancelled');
    await waitUntil(() => listSourceProcessingJobs(queuePath)[1]?.state === 'completed');
    await waitForExit(worker);
    assert.deepEqual(listSourceProcessingJobs(queuePath).map((job) => job.state), [
      'cancelled',
      'completed',
    ]);
  } finally {
    if (worker.exitCode == null && worker.signalCode == null) worker.kill('SIGKILL');
  }
});

test('a replacement worker adopts multiple live source children and records their completion', async () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-source-worker-adopt-'));
  const queuePath = join(root, 'queue.json');
  const briefPath = join(root, 'project-a.json');
  const processorPath = resolve('tests/fixtures/fake-source-processor.mjs');
  writeFileSync(briefPath, JSON.stringify({
    id: 'project-a',
    sources: ['source-01', 'source-02'].map((id) => ({
      id,
      processing: { status: 'pending', stage: 'idle', error: '' },
    })),
  }));
  for (const sourceId of ['source-01', 'source-02']) {
    enqueueSourceProcessingJob(queuePath, { projectId: 'project-a', sourceId, briefPath });
  }
  const oldWorkerPid = 999_999;
  assert.equal(acquireSourceProcessingQueueWorker(queuePath, oldWorkerPid, {
    isProcessAlive: () => false,
  }), true);
  const processors = ['source-01', 'source-02'].map((sourceId) => {
    const claimed = claimNextSourceProcessingJob(queuePath, oldWorkerPid, { maxConcurrent: 2 });
    assert.ok(claimed);
    const processor = spawn(process.execPath, [
      '--import',
      'tsx',
      processorPath,
      '--project=project-a',
      `--source=${sourceId}`,
      `--brief=${briefPath}`,
    ], {
      cwd: process.cwd(),
      env: { ...process.env, VIDEOBRIEF_FAKE_SOURCE_DELAY_MS: '800' },
      stdio: 'ignore',
    });
    assert.ok(processor.pid);
    updateSourceProcessingJob(queuePath, claimed.jobId, { processId: processor.pid });
    return processor;
  });
  const replacement = workerProcess(queuePath, processorPath, {}, 2);
  try {
    await waitUntil(() => listSourceProcessingJobs(queuePath).every((job) => (
      job.workerPid === replacement.pid
    )));
    await waitUntil(() => listSourceProcessingJobs(queuePath).every((job) => (
      job.state === 'completed'
    )));
    await waitForExit(replacement);
    assert.ok(listSourceProcessingJobs(queuePath).every((job) => job.state === 'completed'));
  } finally {
    for (const processor of processors) {
      if (processor.exitCode == null && processor.signalCode == null) processor.kill('SIGKILL');
    }
    if (replacement.exitCode == null && replacement.signalCode == null) replacement.kill('SIGKILL');
  }
});
