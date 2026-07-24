import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import {
  DEFAULT_PROJECT_PLANNING_QUEUE_PATH,
  listProjectPlanningJobs,
  projectPlanningQueueWorker,
} from './projectPlanningQueue';

export function ensureProjectPlanningQueueWorker(queuePath = DEFAULT_PROJECT_PLANNING_QUEUE_PATH) {
  const hasWork = listProjectPlanningJobs(queuePath).some((job) => (
    ['queued', 'running', 'cancelling'].includes(job.state)
  ));
  if (!hasWork) return null;
  const current = projectPlanningQueueWorker(queuePath);
  if (current?.alive) return current.pid;

  const child = spawn(process.execPath, [
    '--import',
    'tsx',
    'scripts/project-planning-queue-worker.ts',
    `--queue=${resolve(queuePath)}`,
  ], {
    cwd: process.cwd(),
    env: process.env,
    detached: process.platform !== 'win32',
    stdio: 'ignore',
  });
  child.unref();
  return child.pid ?? null;
}
