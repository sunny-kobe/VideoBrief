import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

if (!ffmpegPath) {
  throw new Error('ffmpeg-static did not resolve a binary path.');
}

const outputDir = resolve('public/source-clips');
mkdirSync(outputDir, { recursive: true });

const clips = [
  {
    name: 'anthropic-demo-placeholder.mp4',
    filter:
      'testsrc2=size=1280x720:rate=30:duration=6,eq=saturation=0.72:contrast=1.08',
  },
  {
    name: 'research-agent-placeholder.mp4',
    filter:
      'mandelbrot=size=1280x720:rate=30,trim=duration=6,setpts=PTS-STARTPTS,eq=saturation=0.45:brightness=-0.04',
  },
  {
    name: 'comfy-workflow-placeholder.mp4',
    filter:
      'cellauto=size=1280x720:rate=30:rule=110:random_fill_ratio=0.32,trim=duration=6,setpts=PTS-STARTPTS,format=yuv420p',
  },
  {
    name: 'research-ui-placeholder.mp4',
    filter:
      'smptebars=size=1280x720:rate=30:duration=6,eq=saturation=0.55:contrast=1.05',
  },
];

for (const clip of clips) {
  const output = resolve(outputDir, clip.name);
  const result = spawnSync(
    ffmpegPath,
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      clip.filter,
      '-an',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      output,
    ],
    { stdio: 'inherit' },
  );

  if (result.status !== 0) {
    throw new Error(`Failed to generate placeholder clip: ${clip.name}`);
  }
}

console.log(`Generated ${clips.length} placeholder clips in ${outputDir}`);
