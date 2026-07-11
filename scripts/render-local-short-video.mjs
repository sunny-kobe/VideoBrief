import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const sourceVideo = resolve('public/source-clips/openai-codex-app-vertical-30fps.mp4');
const voiceoverAiff = resolve('public/audio/voiceover.aiff');
const voiceoverMp3 = resolve('public/audio/voiceover.mp3');
const output = resolve(process.argv[2] ?? 'output/videos/weekly-ai-short-local-ffmpeg.mp4');
const workDir = resolve('output/videos/local-ffmpeg-work');
const subtitlePath = resolve(workDir, 'weekly-ai-short.ass');

const width = 1080;
const height = 1920;
const fps = 30;

const scenes = [
  {
    start: 0,
    end: 5,
    sourceStart: 0,
    eyebrow: 'OPENAI / CODEX APP',
    title: 'AI 编程，不只是聊天框了',
    subtitle: 'OpenAI 的 Codex app，重点不是聊天，而是把 AI 编程变成任务台。',
  },
  {
    start: 5,
    end: 11,
    sourceStart: 66,
    eyebrow: 'MOBILE WORKFLOW',
    title: '任务可以在手机上继续追踪',
    subtitle: '第一点：AI 编程正在从本地 IDE，扩展到手机和远程任务流。',
  },
  {
    start: 11,
    end: 18,
    sourceStart: 109,
    eyebrow: 'TASK DASHBOARD',
    title: '关键变化：进度可见',
    subtitle: '第二点：真正有价值的是进度可见，结果可检查。',
  },
  {
    start: 18,
    end: 25,
    sourceStart: 159,
    eyebrow: 'CODE AGENT',
    title: '它瞄准的是“交付任务”',
    subtitle: '第三点：它不是写几行代码，而是在接一整个开发任务。',
  },
  {
    start: 25,
    end: 32,
    sourceStart: 190,
    eyebrow: 'REPEATABLE TASKS',
    title: '可复用任务会变成模板',
    subtitle: '真正值得跟的，是能不能沉淀成可复用任务模板。',
  },
  {
    start: 32,
    end: 38,
    sourceStart: 231,
    eyebrow: 'MY TAKE',
    title: '判断：这不是工具更新，是工作流迁移',
    subtitle: '我的判断：别只看发布会，要拿真实项目小任务去测。',
  },
];

function runFfmpeg(args, errorMessage) {
  const result = spawnSync(ffmpegPath, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(errorMessage);
  }
}

function ensureVoiceoverMp3() {
  if (existsSync(voiceoverMp3)) return;
  if (!existsSync(voiceoverAiff)) {
    throw new Error(`Voiceover audio not found: ${voiceoverAiff}`);
  }

  mkdirSync(dirname(voiceoverMp3), { recursive: true });
  runFfmpeg(
    ['-y', '-i', voiceoverAiff, '-ar', '48000', '-ac', '2', '-b:a', '192k', voiceoverMp3],
    'Failed to convert voiceover to MP3.',
  );
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

function assText(text) {
  return text.replaceAll('\\', '\\\\').replaceAll('{', '\\{').replaceAll('}', '\\}');
}

function buildAss() {
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
    'Style: Subtitle,Hiragino Sans GB,46,&H00FFFFFF,&H000000FF,&HD0000000,&HAA000000,-1,0,0,0,100,100,0,0,3,2,0,2,82,82,116,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...dialogue,
    '',
  ].join('\n');
}

function filterPath(path) {
  return path.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "\\'");
}

function buildFilterComplex() {
  const trims = scenes.map((scene, index) => {
    const length = scene.end - scene.start;
    return [
      `[0:v]trim=start=${scene.sourceStart}:duration=${length}`,
      'setpts=PTS-STARTPTS',
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`,
      `fps=${fps}`,
      'setsar=1',
      `format=yuv420p[v${index}]`,
    ].join(',');
  });

  const concatInputs = scenes.map((_, index) => `[v${index}]`).join('');
  const fontsDir = '/System/Library/Fonts';
  const subtitles = `subtitles='${filterPath(subtitlePath)}':fontsdir='${filterPath(fontsDir)}'`;

  return [
    ...trims,
    `${concatInputs}concat=n=${scenes.length}:v=1:a=0,drawbox=x=0:y=1540:w=${width}:h=330:color=black@0.82:t=fill,${subtitles},format=yuv420p[vout]`,
  ].join(';');
}

if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path.');
if (!existsSync(sourceVideo)) throw new Error(`Source video not found: ${sourceVideo}`);

ensureVoiceoverMp3();
mkdirSync(dirname(output), { recursive: true });
mkdirSync(workDir, { recursive: true });
writeFileSync(subtitlePath, buildAss());

runFfmpeg(
  [
    '-y',
    '-i',
    sourceVideo,
    '-i',
    voiceoverMp3,
    '-filter_complex',
    buildFilterComplex(),
    '-map',
    '[vout]',
    '-map',
    '1:a:0',
    '-t',
    '38',
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
  'Failed to render local short video.',
);

console.log(
  JSON.stringify(
    {
      output,
      subtitles: subtitlePath,
      bytes: statSync(output).size,
      source: sourceVideo,
      voiceover: voiceoverMp3,
    },
    null,
    2,
  ),
);
