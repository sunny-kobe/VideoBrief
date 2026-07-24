import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import {
  DEFAULT_SOURCE_PROCESSING_QUEUE_PATH,
  listSourceProcessingJobs,
  sourceProcessingQueueWorker,
} from './sourceProcessingQueue';

export function ensureSourceProcessingQueueWorker(queuePath = DEFAULT_SOURCE_PROCESSING_QUEUE_PATH) {
  const hasWork = listSourceProcessingJobs(queuePath).some((job) => (
    ['queued', 'running', 'cancelling'].includes(job.state)
  ));
  if (!hasWork) return null;
  const current = sourceProcessingQueueWorker(queuePath);
  if (current?.alive) return current.pid;

  const child = spawn(process.execPath, [
    '--import',
    'tsx',
    'scripts/source-processing-queue-worker.ts',
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
