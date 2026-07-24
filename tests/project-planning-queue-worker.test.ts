import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  acquireProjectPlanningQueueWorker,
  cancelProjectPlanningJob,
  claimNextProjectPlanningJob,
  enqueueProjectPlanningJob,
  listProjectPlanningJobs,
  updateProjectPlanningJob,
} from '../src/projectPlanningQueue';
import { signalProcessTree } from '../src/renderProcessRegistry';

async function waitUntil(check: () => boolean, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('Timed out waiting for planning worker state.');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
}

function waitForExit(child: ChildProcess, timeoutMs = 5_000) {
  return new Promise<void>((resolvePromise, reject) => {
    if (child.exitCode != null || child.signalCode != null) return resolvePromise();
    const timeout = setTimeout(() => {
      if (child.pid) signalProcessTree(child.pid, 'SIGKILL');
      reject(new Error('Planning worker did not exit in time.'));
    }, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });
}

function workerProcess(
  queuePath: string,
  plannerPath: string,
  env: Record<string, string | undefined>,
) {
  return spawn(process.execPath, [
    '--import', 'tsx', 'scripts/project-planning-queue-worker.ts',
    `--queue=${queuePath}`,
    `--planner=${plannerPath}`,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: 'ignore',
  });
}

function projectFixture(root: string, projectId: string) {
  const workDir = join(root, `${projectId}-work`);
  const briefPath = join(root, `${projectId}.json`);
  writeFileSync(briefPath, JSON.stringify({
    id: projectId,
    outputs: { workDir },
    narrative: { status: 'idle', activeVersionId: '' },
    scenes: [],
    chapters: [],
    platformCopy: { title: '' },
  }));
  return { briefPath, workDir };
}

test('standalone planning worker drains projects in FIFO order and mirrors completion', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-planning-worker-'));
  const queuePath = join(root, 'queue.json');
  const logPath = join(root, 'planning.log');
  const plannerPath = resolve('tests/fixtures/fake-project-planner.mjs');
  const projects = ['project-a', 'project-b'].map((projectId) => {
    const fixture = projectFixture(root, projectId);
    enqueueProjectPlanningJob(queuePath, {
      projectId, briefPath: fixture.briefPath, instruction: `instruction-${projectId}`,
    });
    return { projectId, ...fixture };
  });

  execFileSync(process.execPath, [
    '--import', 'tsx', 'scripts/project-planning-queue-worker.ts',
    `--queue=${queuePath}`,
    `--planner=${plannerPath}`,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, VIDEOBRIEF_FAKE_PLANNING_LOG: logPath },
  });

  assert.deepEqual(readFileSync(logPath, 'utf8').trim().split('\n'), [
    'project-a|instruction-project-a',
    'project-b|instruction-project-b',
  ]);
  assert.deepEqual(listProjectPlanningJobs(queuePath).map((job) => job.state), ['completed', 'completed']);
  for (const project of projects) {
    assert.equal(existsSync(join(project.workDir, 'planning-job.json')), true);
  }
});

test('a running planning child is terminated from its persisted process id', async () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-planning-worker-cancel-'));
  const queuePath = join(root, 'queue.json');
  const plannerPath = resolve('tests/fixtures/fake-project-planner.mjs');
  const fixture = projectFixture(root, 'project-a');
  const queued = enqueueProjectPlanningJob(queuePath, {
    projectId: 'project-a', briefPath: fixture.briefPath, instruction: '',
  });
  const worker = workerProcess(queuePath, plannerPath, {
    VIDEOBRIEF_FAKE_PLANNING_BRIEF_PATH: fixture.briefPath,
    VIDEOBRIEF_FAKE_PLANNING_DELAY_MS: '10000',
  });
  try {
    await waitUntil(() => Boolean(listProjectPlanningJobs(queuePath)[0]?.processId));
    const cancelling = cancelProjectPlanningJob(queuePath, queued.job.jobId);
    assert.equal(cancelling?.state, 'cancelling');
    assert.equal(signalProcessTree(cancelling!.processId!, 'SIGTERM'), true);
    await waitUntil(() => listProjectPlanningJobs(queuePath)[0]?.state === 'cancelled');
    await waitForExit(worker);
  } finally {
    if (worker.pid) signalProcessTree(worker.pid, 'SIGKILL');
  }
});

test('a replacement planning worker adopts a live child and records completion', async () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-planning-worker-adopt-'));
  const queuePath = join(root, 'queue.json');
  const plannerPath = resolve('tests/fixtures/fake-project-planner.mjs');
  const fixture = projectFixture(root, 'project-a');
  enqueueProjectPlanningJob(queuePath, {
    projectId: 'project-a', briefPath: fixture.briefPath, instruction: '',
  });
  const oldWorkerPid = 999_999;
  assert.equal(acquireProjectPlanningQueueWorker(queuePath, oldWorkerPid, { isProcessAlive: () => false }), true);
  const claimed = claimNextProjectPlanningJob(queuePath, oldWorkerPid);
  assert.ok(claimed);
  const planner = spawn(process.execPath, [plannerPath, 'project-a'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VIDEOBRIEF_FAKE_PLANNING_BRIEF_PATH: fixture.briefPath,
      VIDEOBRIEF_FAKE_PLANNING_DELAY_MS: '800',
    },
    stdio: 'ignore',
  });
  assert.ok(planner.pid);
  updateProjectPlanningJob(queuePath, claimed.jobId, { processId: planner.pid });
  const replacement = workerProcess(queuePath, plannerPath, {
    VIDEOBRIEF_FAKE_PLANNING_BRIEF_PATH: fixture.briefPath,
  });
  try {
    await waitUntil(() => listProjectPlanningJobs(queuePath)[0]?.workerPid === replacement.pid);
    await waitUntil(() => listProjectPlanningJobs(queuePath)[0]?.state === 'completed');
    await waitForExit(replacement);
  } finally {
    if (planner.pid) signalProcessTree(planner.pid, 'SIGKILL');
    if (replacement.pid) signalProcessTree(replacement.pid, 'SIGKILL');
  }
});
