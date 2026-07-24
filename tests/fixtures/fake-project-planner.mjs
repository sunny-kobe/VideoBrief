import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const projectId = process.argv[2];
const instruction = process.argv.slice(3).join(' ').trim();
const delayMs = Number(process.env.VIDEOBRIEF_FAKE_PLANNING_DELAY_MS ?? 0);
const logPath = process.env.VIDEOBRIEF_FAKE_PLANNING_LOG;
const briefPath = process.env.VIDEOBRIEF_PROJECT_BRIEF_PATH
  || process.env.VIDEOBRIEF_FAKE_PLANNING_BRIEF_PATH;

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

console.log('[videobrief-planning-stage] narrative');
await delay(Math.floor(delayMs / 3));
console.log('[videobrief-planning-stage] candidates');
await delay(Math.floor(delayMs / 3));
console.log('[videobrief-planning-stage] assets');
await delay(delayMs - Math.floor(delayMs / 3) * 2);

if (briefPath) {
  const project = JSON.parse(readFileSync(briefPath, 'utf8'));
  project.narrative = { ...(project.narrative ?? {}), status: 'completed', activeVersionId: 'narrative-01' };
  project.scenes = [{ id: 'scene-01' }];
  project.chapters = [{ id: 'chapter-01', sceneIds: ['scene-01'] }];
  project.platformCopy = { ...(project.platformCopy ?? {}), title: 'planned' };
  writeFileSync(briefPath, `${JSON.stringify(project, null, 2)}\n`);
}
if (logPath) appendFileSync(logPath, `${projectId}|${instruction}\n`);
