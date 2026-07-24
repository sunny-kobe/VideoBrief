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
) {
  return spawn(process.execPath, [
    '--import',
    'tsx',
    'scripts/source-processing-queue-worker.ts',
    `--queue=${queuePath}`,
    `--processor=${processorPath}`,
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
  ], {
    cwd: process.cwd(),
    env: { ...process.env, VIDEOBRIEF_FAKE_SOURCE_LOG: logPath },
  });

  assert.deepEqual(readFileSync(logPath, 'utf8').trim().split('\n'), ['source-01', 'source-02']);
  assert.deepEqual(listSourceProcessingJobs(queuePath).map((job) => job.state), ['completed', 'completed']);
  const project = JSON.parse(readFileSync(briefPath, 'utf8'));
  assert.ok(project.sources.every((source: { processing: { status: string } }) => source.processing.status === 'completed'));
});

test('a running source child is terminated when its persisted job is cancelled', async () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-source-worker-cancel-'));
  const queuePath = join(root, 'queue.json');
  const briefPath = join(root, 'project-a.json');
  const processorPath = resolve('tests/fixtures/fake-source-processor.mjs');
  writeFileSync(briefPath, JSON.stringify({
    id: 'project-a',
    sources: [{
      id: 'source-01',
      processing: { status: 'pending', stage: 'idle', error: '' },
    }],
  }));
  const queued = enqueueSourceProcessingJob(queuePath, {
    projectId: 'project-a',
    sourceId: 'source-01',
    briefPath,
  });
  const worker = workerProcess(queuePath, processorPath, {
    VIDEOBRIEF_FAKE_SOURCE_DELAY_MS: '10000',
  });
  try {
    await waitUntil(() => Boolean(listSourceProcessingJobs(queuePath)[0]?.processId));
    assert.equal(cancelSourceProcessingJob(queuePath, queued.job.jobId)?.state, 'cancelling');
    await waitUntil(() => listSourceProcessingJobs(queuePath)[0]?.state === 'cancelled');
    await waitForExit(worker);
    assert.equal(listSourceProcessingJobs(queuePath)[0]?.state, 'cancelled');
  } finally {
    if (worker.exitCode == null && worker.signalCode == null) worker.kill('SIGKILL');
  }
});

test('a replacement worker adopts a live source child and records its completion', async () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-source-worker-adopt-'));
  const queuePath = join(root, 'queue.json');
  const briefPath = join(root, 'project-a.json');
  const processorPath = resolve('tests/fixtures/fake-source-processor.mjs');
  writeFileSync(briefPath, JSON.stringify({
    id: 'project-a',
    sources: [{
      id: 'source-01',
      processing: { status: 'pending', stage: 'idle', error: '' },
    }],
  }));
  enqueueSourceProcessingJob(queuePath, {
    projectId: 'project-a',
    sourceId: 'source-01',
    briefPath,
  });
  const oldWorkerPid = 999_999;
  assert.equal(acquireSourceProcessingQueueWorker(queuePath, oldWorkerPid, {
    isProcessAlive: () => false,
  }), true);
  const claimed = claimNextSourceProcessingJob(queuePath, oldWorkerPid);
  assert.ok(claimed);
  const processor = spawn(process.execPath, [
    processorPath,
    '--project=project-a',
    '--source=source-01',
    `--brief=${briefPath}`,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, VIDEOBRIEF_FAKE_SOURCE_DELAY_MS: '800' },
    stdio: 'ignore',
  });
  assert.ok(processor.pid);
  updateSourceProcessingJob(queuePath, claimed.jobId, { processId: processor.pid });
  const replacement = workerProcess(queuePath, processorPath);
  try {
    await waitUntil(() => listSourceProcessingJobs(queuePath)[0]?.workerPid === replacement.pid);
    await waitUntil(() => listSourceProcessingJobs(queuePath)[0]?.state === 'completed');
    await waitForExit(replacement);
    assert.equal(listSourceProcessingJobs(queuePath)[0]?.state, 'completed');
  } finally {
    if (processor.exitCode == null && processor.signalCode == null) processor.kill('SIGKILL');
    if (replacement.exitCode == null && replacement.signalCode == null) replacement.kill('SIGKILL');
  }
});
