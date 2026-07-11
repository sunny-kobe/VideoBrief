import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const input = resolve(process.argv[2] ?? 'content/voiceover.zh-CN.txt');
const output = resolve(process.argv[3] ?? 'public/audio/voiceover.aiff');
const voice = process.env.VOICEOVER_VOICE ?? 'Eddy (中文（中国大陆）)';
const rate = process.env.VOICEOVER_RATE ?? '205';

if (!existsSync(input)) {
  throw new Error(`Voiceover script not found: ${input}`);
}

const text = readFileSync(input, 'utf8').trim();
if (!text) {
  throw new Error(`Voiceover script is empty: ${input}`);
}

mkdirSync(dirname(output), { recursive: true });

const result = spawnSync(
  '/usr/bin/say',
  ['-v', voice, '-r', rate, '-o', output, text],
  { encoding: 'utf8' },
);

if (result.status !== 0) {
  console.error(result.stdout);
  console.error(result.stderr);
  throw new Error(`Failed to generate voiceover with macOS say voice: ${voice}`);
}

const size = statSync(output).size;
console.log(`Voiceover ready: ${output} (${(size / 1024 / 1024).toFixed(2)} MB, voice=${voice}, rate=${rate})`);
