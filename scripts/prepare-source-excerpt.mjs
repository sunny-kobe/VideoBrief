import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

function readFlag(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

const inputArg = readFlag('--input') ?? process.argv[2];
const start = readFlag('--start', '00:00:00');
const duration = Number(readFlag('--duration', '3'));
const maxDuration = Number(readFlag('--max-duration', '12'));
const name = readFlag('--name');

if (!ffmpegPath) {
  throw new Error('ffmpeg-static did not resolve a binary path.');
}

if (!inputArg) {
  throw new Error('Usage: node scripts/prepare-source-excerpt.mjs --input source.mp4 --start 00:00:12 --duration 3 --name demo-excerpt');
}

if (!Number.isFinite(duration) || duration <= 0 || duration > maxDuration) {
  throw new Error(`Excerpt duration must be > 0 and <= ${maxDuration} seconds. Received: ${duration}`);
}

const input = resolve(inputArg);
if (!existsSync(input)) {
  throw new Error(`Input video not found: ${input}`);
}

const sourceName = name ?? basename(input, extname(input));
const outputDir = resolve('public/source-clips/excerpts');
const output = resolve(outputDir, `${sourceName}-${String(start).replaceAll(':', '-')}-${duration}s.mp4`);

mkdirSync(outputDir, { recursive: true });

const result = spawnSync(
  ffmpegPath,
  [
    '-y',
    '-ss',
    start,
    '-i',
    input,
    '-t',
    String(duration),
    '-vf',
    'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
    '-an',
    '-r',
    '30',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
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
console.log(`Source excerpt ready: ${output} (${duration}s, ${(size / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Timeline src: source-clips/excerpts/${basename(output)}`);
