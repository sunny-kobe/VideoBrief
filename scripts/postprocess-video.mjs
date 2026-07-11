import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const input = resolve(process.argv[2] ?? 'output/videos/weekly-ai-short.mp4');
const output = resolve(process.argv[3] ?? 'output/videos/weekly-ai-short-final.mp4');
const voiceover = resolve(process.env.VOICEOVER_AUDIO ?? 'public/audio/voiceover.aiff');

if (!ffmpegPath) {
  throw new Error('ffmpeg-static did not resolve a binary path.');
}

if (!existsSync(input)) {
  throw new Error(`Input video not found: ${input}`);
}

mkdirSync(dirname(output), { recursive: true });

const hasVoiceover = existsSync(voiceover);
const audioArgs = hasVoiceover
  ? [
      '-i',
      voiceover,
      '-filter_complex',
      '[1:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo,apad=pad_dur=60[aout]',
      '-map',
      '0:v:0',
      '-map',
      '[aout]',
    ]
  : [
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
    ];

const args = [
  '-y',
  '-i',
  input,
  ...audioArgs,
  '-shortest',
  '-fps_mode',
  'cfr',
  '-r',
  '30',
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '16',
  '-maxrate',
  '10M',
  '-bufsize',
  '20M',
  '-g',
  '60',
  '-keyint_min',
  '60',
  '-sc_threshold',
  '0',
  '-profile:v',
  'high',
  '-level',
  '4.1',
  '-video_track_timescale',
  '30000',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-b:a',
  '160k',
  '-movflags',
  '+faststart',
  output,
];

console.log(`Post-processing video:\n  input:  ${input}\n  audio:  ${hasVoiceover ? voiceover : 'silent fallback'}\n  output: ${output}`);

const child = spawn(ffmpegPath, args, {
  stdio: ['ignore', 'inherit', 'inherit'],
});

child.on('exit', (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }

  const size = statSync(output).size;
  console.log(`Post-processed MP4 ready: ${output} (${(size / 1024 / 1024).toFixed(2)} MB)`);
});
