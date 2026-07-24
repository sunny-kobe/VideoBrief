import { appendFileSync } from 'node:fs';

const briefArg = process.argv.find((argument) => argument.startsWith('--brief='));
if (!briefArg || !process.env.VIDEOBRIEF_FAKE_RENDER_LOG) process.exit(2);

const briefPath = briefArg.slice('--brief='.length);
appendFileSync(process.env.VIDEOBRIEF_FAKE_RENDER_LOG, `${briefPath}\n`);
console.log('[videobrief-stage] rendering');
const delayMs = Number(process.env.VIDEOBRIEF_FAKE_RENDER_DELAY_MS ?? 0);
if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
console.log('[videobrief-stage] proof');
console.log('[videobrief-stage] awaiting-review');
