import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const input = resolve(process.argv[2] ?? 'content/sources/openai-codex-app.f398.mp4');
const output = resolve(process.argv[3] ?? 'public/source-clips/openai-codex-app-vertical-30fps.mp4');

if (!ffmpegPath) {
  throw new Error('ffmpeg-static did not resolve a binary path.');
}

if (!existsSync(input)) {
  throw new Error(`Input video not found: ${input}`);
}

mkdirSync(dirname(output), { recursive: true });

const result = spawnSync(
  ffmpegPath,
  [
    '-y',
    '-i',
    input,
    '-vf',
    'fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setpts=N/(30*TB),format=yuv420p',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-profile:v',
    'high',
    '-level',
    '4.1',
    '-movflags',
    '+faststart',
    output,
  ],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const size = statSync(output).size;
console.log(`Smooth source ready: ${output} (${(size / 1024 / 1024).toFixed(2)} MB)`);
