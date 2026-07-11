import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const args = new Map();
const positional = [];
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg.startsWith('--')) {
    const [key, inlineValue] = arg.slice(2).split('=');
    const value = inlineValue ?? process.argv[index + 1];
    args.set(key, value);
    if (inlineValue == null) index += 1;
  } else {
    positional.push(arg);
  }
}

const briefPath = resolve(
  args.get('brief') ?? 'content/projects/codex-app-explainer/project.json',
);
const briefText = readFileSync(briefPath, 'utf8');
const brief = JSON.parse(briefText);
const outputs = brief.outputs ?? brief;
const sources = Array.isArray(brief.sources) && brief.sources.length
  ? brief.sources
  : [
      {
        id: 'legacy-source',
        label: 'Legacy source',
        assetPath: brief.sourceVideo,
      },
    ];
const sourceInputs = sources.map((source) => ({
  ...source,
  path: resolve(source.assetPath),
}));
const sourceIndexById = new Map(sourceInputs.map((source, index) => [source.id, index]));
const defaultSourceId = sourceInputs[0]?.id;
const output = resolve(args.get('output') ?? positional[0] ?? outputs.outputVideo);
const publicRender = outputs.publicRender ? resolve(outputs.publicRender) : null;
const workDir = resolve(outputs.workDir ?? 'output/videos/local-ffmpeg-synced-work');
const subtitlePath = resolve(workDir, 'weekly-ai-short-synced.ass');
const srtPath = resolve(workDir, 'weekly-ai-short-synced.srt');
const concatListPath = resolve(workDir, 'voiceover-segments.txt');
const voiceoverPath = resolve(workDir, 'voiceover-synced.aiff');
const timelinePath = resolve(workDir, 'timeline.json');
const manifestPath = resolve(workDir, 'render-manifest.json');
const projectFingerprint = createHash('sha256').update(briefText).digest('hex');

const width = Number(brief.render?.width ?? 1080);
const height = Number(brief.render?.height ?? 1920);
const fps = Number(brief.render?.fps ?? 30);
const voice = process.env.VOICEOVER_VOICE ?? brief.render?.voice ?? 'Eddy (中文（中国大陆）)';
const rate = String(process.env.VOICEOVER_RATE ?? brief.render?.rate ?? 205);
const sceneSpecs = (brief.scenes ?? [])
  .filter((scene) => scene.enabled !== false)
  .map((scene) => ({ ...scene, sourceId: scene.sourceId ?? defaultSourceId }));

function run(command, args, errorMessage) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(errorMessage);
  }
  return result;
}

function runFfmpeg(args, errorMessage) {
  return run(ffmpegPath, args, errorMessage);
}

function filterPath(path) {
  return path.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "\\'");
}

function concatFilePath(path) {
  return path.replaceAll("'", "'\\''");
}

function audioDuration(path) {
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-i', path], { encoding: 'utf8' });
  const match = result.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Could not parse audio duration for ${path}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function generateVoiceSegment(scene, index) {
  const rawPath = resolve(workDir, `voice-${String(index + 1).padStart(2, '0')}.aiff`);
  const paddedPath = resolve(workDir, `voice-padded-${String(index + 1).padStart(2, '0')}.aiff`);
  const subtitle = String(scene.subtitle ?? '').trim();
  run(
    '/usr/bin/say',
    ['-v', voice, '-r', rate, '-o', rawPath, subtitle],
    `Failed to generate voice segment ${index + 1}.`,
  );
  const voiceDuration = Math.max(1.8, audioDuration(rawPath) + 0.12);
  const selectedDuration =
    Number.isFinite(scene.sourceEnd) && Number.isFinite(scene.sourceStart)
      ? Math.max(0, Number(scene.sourceEnd) - Number(scene.sourceStart))
      : 0;
  const duration = Math.max(voiceDuration, selectedDuration || voiceDuration);
  runFfmpeg(
    [
      '-y',
      '-i',
      rawPath,
      '-af',
      `apad,atrim=0:${duration.toFixed(3)}`,
      '-ar',
      '48000',
      '-ac',
      '2',
      paddedPath,
    ],
    `Failed to pad voice segment ${index + 1}.`,
  );
  return {
    ...scene,
    id: scene.id ?? `scene-${String(index + 1).padStart(2, '0')}`,
    sourceStart: Number(scene.sourceStart ?? 0),
    sourceEnd: Number(scene.sourceStart ?? 0) + duration,
    eyebrow: String(scene.eyebrow ?? ''),
    title: String(scene.title ?? ''),
    subtitle,
    rawPath,
    paddedPath,
    duration,
  };
}

function assTime(seconds) {
  const totalCentiseconds = Math.round(seconds * 100);
  const cs = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function srtTime(seconds) {
  const totalMilliseconds = Math.round(seconds * 1000);
  const ms = totalMilliseconds % 1000;
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function assText(text) {
  return text.replaceAll('\\', '\\\\').replaceAll('{', '\\{').replaceAll('}', '\\}');
}

function buildTimeline(scenes) {
  let cursor = 0;
  return scenes.map((scene) => {
    const start = cursor;
    const end = start + scene.duration;
    cursor = end;
    return { ...scene, start, end };
  });
}

function buildSrt(scenes) {
  return (
    scenes
      .map((scene, index) =>
        [
          String(index + 1),
          `${srtTime(scene.start)} --> ${srtTime(scene.end)}`,
          scene.subtitle,
          '',
        ].join('\n'),
      )
      .join('\n') + '\n'
  );
}

function buildAss(scenes) {
  const dialogue = scenes.flatMap((scene) => {
    const start = assTime(scene.start);
    const end = assTime(scene.end);
    return [
      `Dialogue: 0,${start},${end},Eyebrow,,0,0,0,,${assText(scene.eyebrow)}`,
      `Dialogue: 0,${start},${end},Title,,0,0,0,,${assText(scene.title)}`,
      `Dialogue: 0,${start},${end},Subtitle,,0,0,0,,${assText(scene.subtitle)}`,
    ];
  });

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Eyebrow,Hiragino Sans GB,34,&H00E5FFF7,&H000000FF,&H96000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,1,7,78,78,126,1',
    'Style: Title,Hiragino Sans GB,58,&H00FFFFFF,&H000000FF,&HB0000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,1,7,78,78,182,1',
    'Style: Subtitle,Hiragino Sans GB,42,&H00FFFFFF,&H000000FF,&HD0000000,&HAA000000,-1,0,0,0,100,100,0,0,3,2,0,2,82,82,116,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...dialogue,
    '',
  ].join('\n');
}

function buildVoiceover(scenes) {
  writeFileSync(
    concatListPath,
    scenes.map((scene) => `file '${concatFilePath(scene.paddedPath)}'`).join('\n') + '\n',
  );

  runFfmpeg(
    [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      '-ar',
      '48000',
      '-ac',
      '2',
      voiceoverPath,
    ],
    'Failed to concatenate voiceover segments.',
  );
}

function buildFilterComplex(scenes) {
  const trims = scenes.map((scene, index) => {
    const length = scene.end - scene.start;
    const sourceIndex = sourceIndexById.get(scene.sourceId);
    if (sourceIndex == null) throw new Error(`Unknown sourceId ${scene.sourceId} in ${scene.id}.`);
    return [
      `[${sourceIndex}:v]trim=start=${scene.sourceStart}:duration=${length.toFixed(3)}`,
      'setpts=PTS-STARTPTS',
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`,
      `fps=${fps}`,
      'setsar=1',
      `format=yuv420p[v${index}]`,
    ].join(',');
  });

  const concatInputs = scenes.map((_, index) => `[v${index}]`).join('');
  const subtitles = `subtitles='${filterPath(subtitlePath)}':fontsdir='${filterPath('/System/Library/Fonts')}'`;

  return [
    ...trims,
    `${concatInputs}concat=n=${scenes.length}:v=1:a=0,drawbox=x=0:y=1540:w=${width}:h=330:color=black@0.82:t=fill,${subtitles},format=yuv420p[vout]`,
  ].join(';');
}

if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path.');
for (const source of sourceInputs) {
  if (!source.assetPath) throw new Error(`Source ${source.id} is missing assetPath.`);
  if (!existsSync(source.path)) throw new Error(`Source video not found: ${source.path}`);
}
if (!sceneSpecs.length) throw new Error(`No enabled scenes found in ${briefPath}`);

mkdirSync(dirname(output), { recursive: true });
mkdirSync(workDir, { recursive: true });
if (publicRender) mkdirSync(dirname(publicRender), { recursive: true });

const scenesWithAudio = sceneSpecs.map(generateVoiceSegment);
const scenes = buildTimeline(scenesWithAudio);
const duration = scenes.at(-1).end;

buildVoiceover(scenes);
writeFileSync(subtitlePath, buildAss(scenes));
writeFileSync(srtPath, buildSrt(scenes));

runFfmpeg(
  [
    '-y',
    ...sourceInputs.flatMap((source) => ['-i', source.path]),
    '-i',
    voiceoverPath,
    '-filter_complex',
    buildFilterComplex(scenes),
    '-map',
    '[vout]',
    '-map',
    `${sourceInputs.length}:a:0`,
    '-t',
    duration.toFixed(3),
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '18',
    '-profile:v',
    'high',
    '-level',
    '4.2',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
    '-g',
    String(fps * 2),
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    output,
  ],
  'Failed to render synced local short video.',
);

if (publicRender) {
  copyFileSync(output, publicRender);
}

writeFileSync(
  timelinePath,
  `${JSON.stringify({ briefPath, duration, scenes }, null, 2)}\n`,
);

const artifacts = {
  outputVideo: output,
  publicRender,
  subtitles: subtitlePath,
  srt: srtPath,
  voiceover: voiceoverPath,
  timeline: timelinePath,
};
const manifest = {
  schemaVersion: 1,
  projectId: brief.id,
  projectFingerprint,
  renderedAt: new Date().toISOString(),
  briefPath,
  render: { width, height, fps, duration },
  artifacts,
  scenes: scenes.map((scene) => ({
    id: scene.id,
    sourceId: scene.sourceId,
    start: scene.start,
    end: scene.end,
    sourceStart: scene.sourceStart,
    sourceEnd: scene.sourceEnd,
  })),
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      output,
      subtitles: subtitlePath,
      srt: srtPath,
      voiceover: voiceoverPath,
      timeline: timelinePath,
      manifest: manifestPath,
      publicRender,
      duration,
      bytes: statSync(output).size,
    },
    null,
    2,
  ),
);
