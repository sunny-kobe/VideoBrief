import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import {
  DEFAULT_RENDER_QUEUE_PATH,
  listRenderQueueJobs,
  renderQueueWorker,
} from './renderQueue';

export function ensureRenderQueueWorker(queuePath = DEFAULT_RENDER_QUEUE_PATH) {
  const hasWork = listRenderQueueJobs(queuePath).some((job) => (
    ['queued', 'running', 'cancelling'].includes(job.state)
  ));
  if (!hasWork) return null;
  const current = renderQueueWorker(queuePath);
  if (current?.alive) return current.pid;

  const child = spawn(process.execPath, [
    '--import',
    'tsx',
    'scripts/render-queue-worker.ts',
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
