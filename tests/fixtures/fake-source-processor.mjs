import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

function flag(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? '';
}

const briefPath = flag('brief');
const sourceId = flag('source');
const project = JSON.parse(readFileSync(briefPath, 'utf8'));
const source = project.sources.find((item) => item.id === sourceId);
if (!source) throw new Error(`Missing fake source ${sourceId}`);
source.processing = { ...source.processing, status: 'running', stage: 'fact-extraction', error: '' };
writeFileSync(briefPath, JSON.stringify(project));
if (process.env.VIDEOBRIEF_FAKE_SOURCE_LOG) {
  appendFileSync(process.env.VIDEOBRIEF_FAKE_SOURCE_LOG, `${sourceId}\n`);
}
const delay = Number(process.env.VIDEOBRIEF_FAKE_SOURCE_DELAY_MS ?? 0);
if (delay > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, delay));
source.processing = { ...source.processing, status: 'completed', stage: 'completed', error: '' };
writeFileSync(briefPath, JSON.stringify(project));
