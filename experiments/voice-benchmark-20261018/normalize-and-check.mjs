import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { safeWorkspacePath } from '../../scripts/lib/creative-shot.mjs';

const root = process.cwd();
const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) throw new Error('Provide input and new output manifests inside output/.');
const inputPath = safeWorkspacePath(root, inputArg, { output: true, mustExist: true });
const outputPath = safeWorkspacePath(root, outputArg, { output: true });
if (existsSync(outputPath)) throw new Error('Refusing to overwrite manifest.');
const manifest = JSON.parse(readFileSync(inputPath, 'utf8'));
const processed = resolve('output/voice-benchmark-20261018/processed');
mkdirSync(processed, { recursive: true });
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
function run(args, timeout = 60_000) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', timeout, maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Audio processing failed: ${result.error?.name || result.stderr.slice(-350)}`);
  return result;
}
function loudness(stderr) {
  const json = stderr.match(/\{\s*"input_i"[\s\S]*?\}/g)?.at(-1);
  if (!json) throw new Error('Loudness measurements missing.');
  const stats = JSON.parse(json);
  if (!Object.values(stats).filter((value) => /^-?\d/.test(value)).every((value) => Number.isFinite(Number(value)))) throw new Error('Invalid loudness measurements.');
  return stats;
}

for (const row of manifest.rows) {
  if (!row.audioPath) continue;
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(row.id)) throw new Error('Unsafe sample id.');
  const raw = safeWorkspacePath(root, row.audioPath, { output: true, mustExist: true });
  if (hash(raw) !== row.audioSha256) throw new Error(`Input hash changed: ${row.id}`);
  const audioPath = resolve(processed, `${row.id}.m4a`);
  const receiptPath = resolve(processed, `${row.id}.receipt.json`);
  let receipt;
  if (existsSync(receiptPath)) {
    receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    if (receipt.inputSha256 !== row.audioSha256 || hash(audioPath) !== receipt.outputSha256) throw new Error('Prior processed take changed.');
  } else {
    if (existsSync(audioPath)) throw new Error('Unreceipted processed audio exists.');
    const measured = loudness(run(['-i', raw, '-vn', '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']).stderr);
    const filter = `loudnorm=I=-18:TP=-1.5:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=json`;
    const outputMeasured = loudness(run(['-n', '-i', raw, '-vn', '-af', filter, '-ar', '48000', '-ac', '1', '-c:a', 'aac', '-b:a', '192k', audioPath]).stderr);
    const decoded = run(['-i', audioPath, '-map', '0:a:0', '-progress', 'pipe:1', '-f', 'null', '-']);
    const duration = Math.max(...Array.from(decoded.stdout.matchAll(/out_time_us=(\d+)/g), (m) => Number(m[1]) / 1_000_000));
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Audio duration is unavailable.');
    receipt = { schemaVersion: 1, id: row.id, inputSha256: row.audioSha256, outputSha256: hash(audioPath), targetLufs: -18, truePeakLimitDb: -1.5, playbackRate: 1, sampleRateHz: 48000, channels: 1, durationSeconds: duration, fullDecodePassed: true, measured, outputMeasured,
      note: '仅统一响度与采样规格；原始音频保留，不改变语速、音高或停顿。主观听感未评定。' };
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  }
  row.normalizedAudioPath = audioPath; row.normalizedSha256 = receipt.outputSha256; row.durationSeconds = receipt.durationSeconds;
  row.normalizationEvidence = receiptPath;
  console.log(JSON.stringify({ id: row.id, durationSeconds: row.durationSeconds, fullDecodePassed: true, lufs: receipt.outputMeasured.output_i }));
}
writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
