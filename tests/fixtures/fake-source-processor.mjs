import { appendFileSync, readFileSync } from 'node:fs';

import { withJsonFileLock, writeAtomicJson } from '../../src/persistentJsonQueue.ts';

function flag(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? '';
}

const briefPath = flag('brief');
const sourceId = flag('source');

function updateProcessing(status, stage) {
  withJsonFileLock(briefPath, () => {
    const project = JSON.parse(readFileSync(briefPath, 'utf8'));
    const source = project.sources.find((item) => item.id === sourceId);
    if (!source) throw new Error(`Missing fake source ${sourceId}`);
    source.processing = { ...source.processing, status, stage, error: '' };
    writeAtomicJson(briefPath, project);
  });
}

function logEvent(event) {
  if (!process.env.VIDEOBRIEF_FAKE_SOURCE_EVENTS) return;
  appendFileSync(process.env.VIDEOBRIEF_FAKE_SOURCE_EVENTS, `${event} ${sourceId} ${Date.now()}\n`);
}

updateProcessing('running', 'fact-extraction');
logEvent('start');
if (process.env.VIDEOBRIEF_FAKE_SOURCE_LOG) {
  appendFileSync(process.env.VIDEOBRIEF_FAKE_SOURCE_LOG, `${sourceId}\n`);
}
const delay = Number(process.env.VIDEOBRIEF_FAKE_SOURCE_DELAY_MS ?? 0);
if (delay > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, delay));
updateProcessing('completed', 'completed');
logEvent('end');
