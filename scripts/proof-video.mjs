import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith('--')) continue;
  const [key, inlineValue] = arg.slice(2).split('=');
  const value = inlineValue ?? process.argv[index + 1];
  args.set(key, value);
  if (inlineValue == null) index += 1;
}

const manifestPath = resolve(
  args.get('manifest') ?? 'output/videos/codex-app-explainer-work/render-manifest.json',
);

if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path.');
if (!existsSync(manifestPath)) throw new Error(`Render manifest not found: ${manifestPath}`);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const input = resolve(manifest.artifacts?.publicRender ?? manifest.artifacts?.outputVideo ?? '');
const proofDir = args.get('proof-dir')
  ? resolve(args.get('proof-dir'))
  : resolve(dirname(manifestPath), 'proof');
const issues = [];
const proofFrames = [];

function writeProofResult(passed) {
  const next = {
    ...manifest,
    proof: {
      passed,
      checkedAt: new Date().toISOString(),
      issues,
      frames: proofFrames,
    },
  };
  const temporaryPath = `${manifestPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(temporaryPath, manifestPath);
}

if (!input || !existsSync(input)) issues.push(`Rendered video not found: ${input || 'missing path'}.`);

for (const [name, path] of Object.entries(manifest.artifacts ?? {})) {
  if (path && (!existsSync(path) || statSync(path).size === 0)) {
    issues.push(`Artifact ${name} is missing or empty: ${path}.`);
  }
}

if (manifest.briefPath && existsSync(manifest.briefPath)) {
  const fingerprint = createHash('sha256')
    .update(readFileSync(manifest.briefPath))
    .digest('hex');
  if (fingerprint !== manifest.projectFingerprint) {
    issues.push('Project file changed after render; the MP4 is stale.');
  }
} else {
  issues.push(`Project file not found: ${manifest.briefPath ?? 'missing path'}.`);
}

if (issues.length === 0) {
  mkdirSync(proofDir, { recursive: true });
  const probe = spawnSync(ffmpegPath, ['-hide_banner', '-i', input], { encoding: 'utf8' });
  const probeText = `${probe.stdout ?? ''}\n${probe.stderr ?? ''}`;
  const durationMatch = probeText.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  const resolutionMatch = probeText.match(/Video:.*?(\d{3,5})x(\d{3,5})/);
  const fpsMatch = probeText.match(/,\s*([\d.]+)\s*fps,/);
  const hasAudio = /Audio:/.test(probeText);

  if (!durationMatch || !resolutionMatch) {
    issues.push('Could not read video duration or resolution.');
  } else {
    const [, hours, minutes, seconds] = durationMatch;
    const durationSeconds = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
    const width = Number(resolutionMatch[1]);
    const height = Number(resolutionMatch[2]);
    const fps = fpsMatch ? Number(fpsMatch[1]) : null;
    const expected = manifest.render;

    if (width !== expected.width || height !== expected.height) {
      issues.push(`Expected ${expected.width}x${expected.height}, got ${width}x${height}.`);
    }
    if (Math.abs(durationSeconds - expected.duration) > 0.35) {
      issues.push(
        `Expected ${expected.duration.toFixed(2)}s from the render manifest, got ${durationSeconds.toFixed(2)}s.`,
      );
    }
    if (fps !== null && Math.abs(fps - expected.fps) > 0.1) {
      issues.push(`Expected ${expected.fps}fps, got ${fps}fps.`);
    }
    if (!hasAudio) issues.push('Expected an audio stream, but none was found.');

    if (hasAudio) {
      const volumeProbe = spawnSync(
        ffmpegPath,
        ['-hide_banner', '-i', input, '-af', 'volumedetect', '-f', 'null', '-'],
        { encoding: 'utf8' },
      );
      const volumeText = `${volumeProbe.stdout ?? ''}\n${volumeProbe.stderr ?? ''}`;
      const meanVolumeMatch = volumeText.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
      if (!meanVolumeMatch) {
        issues.push('Could not verify audio level with volumedetect.');
      } else if (Number(meanVolumeMatch[1]) < -55) {
        issues.push(`Audio stream appears too quiet: mean_volume=${meanVolumeMatch[1]} dB.`);
      }
    }

    const framePlan = [0.1, 0.3, 0.5, 0.7, 0.9].map((ratio) => ({
      label: `${Math.round(ratio * 100)}pct`,
      second: Math.max(0.1, Math.min(durationSeconds - 0.1, durationSeconds * ratio)),
    }));
    for (const frame of framePlan) {
      const output = resolve(proofDir, `frame-${frame.label}.png`);
      const result = spawnSync(
        ffmpegPath,
        [
          '-y',
          '-ss',
          frame.second.toFixed(3),
          '-i',
          input,
          '-frames:v',
          '1',
          '-update',
          '1',
          output,
        ],
        { stdio: 'ignore' },
      );
      if (result.status !== 0 || !existsSync(output) || statSync(output).size === 0) {
        issues.push(`Failed to extract proof frame at ${frame.second.toFixed(2)}s.`);
      } else {
        proofFrames.push(output);
      }
    }
  }
}

writeProofResult(issues.length === 0);

if (issues.length > 0) {
  console.error('Video proof failed:');
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}

console.log(`Video proof passed for ${manifest.projectId}.`);
console.log(`Manifest updated: ${manifestPath}`);
console.log(`Proof frames written to ${proofDir}`);
