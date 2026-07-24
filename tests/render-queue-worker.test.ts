import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  cancelRenderQueueJob,
  enqueueRenderQueueJob,
  listRenderQueueJobs,
} from '../src/renderQueue';
import { signalProcessTree } from '../src/renderProcessRegistry';

async function waitFor<T>(read: () => T | null, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = read();
    if (value) return value;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  throw new Error('Timed out waiting for render worker state.');
}

test('the standalone worker drains two projects in FIFO order', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-render-worker-'));
  const queuePath = join(root, 'queue.json');
  const renderLockPath = join(root, 'render.lock');
  const logPath = join(root, 'render.log');
  const briefPaths = ['project-a', 'project-b'].map((projectId) => {
    const workDir = join(root, `${projectId}-work`);
    const briefPath = join(root, `${projectId}.json`);
    writeFileSync(briefPath, JSON.stringify({ id: projectId, outputs: { workDir } }));
    enqueueRenderQueueJob(queuePath, { projectId, briefPath });
    return briefPath;
  });

  execFileSync(process.execPath, [
    '--import',
    'tsx',
    'scripts/render-queue-worker.ts',
    `--queue=${queuePath}`,
    `--render-lock=${renderLockPath}`,
    `--renderer=${resolve('tests/fixtures/fake-render-worker.mjs')}`,
    '--drain',
  ], {
    cwd: process.cwd(),
    env: { ...process.env, VIDEOBRIEF_FAKE_RENDER_LOG: logPath },
  });

  assert.deepEqual(readFileSync(logPath, 'utf8').trim().split('\n'), briefPaths);
  assert.deepEqual(listRenderQueueJobs(queuePath).map((job) => job.state), [
    'awaiting_review',
    'awaiting_review',
  ]);
  for (const projectId of ['project-a', 'project-b']) {
    const jobPath = join(root, `${projectId}-work`, 'render-job.json');
    assert.equal(existsSync(jobPath), true);
    assert.equal(JSON.parse(readFileSync(jobPath, 'utf8')).state, 'awaiting_review');
  }
});

test('a running queued render can be cancelled from its persisted process id', async () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-render-worker-cancel-'));
  const queuePath = join(root, 'queue.json');
  const renderLockPath = join(root, 'render.lock');
  const logPath = join(root, 'render.log');
  const workDir = join(root, 'project-a-work');
  const briefPath = join(root, 'project-a.json');
  writeFileSync(briefPath, JSON.stringify({ id: 'project-a', outputs: { workDir } }));
  const queued = enqueueRenderQueueJob(queuePath, { projectId: 'project-a', briefPath });
  const worker = spawn(process.execPath, [
    '--import',
    'tsx',
    'scripts/render-queue-worker.ts',
    `--queue=${queuePath}`,
    `--render-lock=${renderLockPath}`,
    `--renderer=${resolve('tests/fixtures/fake-render-worker.mjs')}`,
    '--drain',
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VIDEOBRIEF_FAKE_RENDER_LOG: logPath,
      VIDEOBRIEF_FAKE_RENDER_DELAY_MS: '10000',
    },
  });

  try {
    const running = await waitFor(() => {
      const job = listRenderQueueJobs(queuePath).find((item) => item.jobId === queued.job.jobId);
      return job?.state === 'running' && job.processId ? job : null;
    });
    const cancelling = cancelRenderQueueJob(queuePath, running.jobId);
    assert.equal(cancelling?.state, 'cancelling');
    assert.equal(signalProcessTree(running.processId!, 'SIGTERM'), true);
    await new Promise<void>((resolvePromise, reject) => {
      worker.once('error', reject);
      worker.once('close', () => resolvePromise());
    });
    const [cancelled] = listRenderQueueJobs(queuePath);
    assert.equal(cancelled.state, 'cancelled');
    assert.equal(cancelled.error, '');
  } finally {
    if (worker.pid) signalProcessTree(worker.pid, 'SIGKILL');
  }
});
