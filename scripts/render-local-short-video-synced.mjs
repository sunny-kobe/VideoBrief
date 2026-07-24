import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { parseCliArgs } from './lib/cli-args.mjs';
import { validateVideoWindow } from './lib/media-window-validation.mjs';
import { resolveSceneTiming } from './lib/scene-timing.mjs';
import { planVideoInputBranches } from './lib/video-input-branches.mjs';
import {
  parseSilenceIntervals,
  planVoiceSegments,
  resolveAudibleVoiceWindow,
} from './lib/voiceover-segmentation.mjs';
import { assertRenderedDuration } from './lib/video-duration-contract.mjs';
import { planVoiceoverBatches } from './lib/voiceover-batching.mjs';
import { shouldFallbackBatchVoiceover } from './lib/voiceover-batch-policy.mjs';
import { planSubtitleCues } from './lib/subtitle-cues.mjs';
import { assertRenderCapacity } from './lib/render-capacity.mjs';
import {
  buildChapterFingerprints,
  buildSemanticReviewReuse,
} from './lib/chapter-fingerprints.mjs';
import {
  SEGMENT_RENDERER_VERSION,
  segmentCacheIsReusable,
  segmentRenderCacheKey,
} from './lib/segment-render-cache.mjs';
import { resolveVoiceoverConfig, synthesizeVoiceover } from '../src/voiceoverProvider.mjs';

const renderProcessStartedAt = new Date();

const { args, positional } = parseCliArgs(process.argv.slice(2));

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
const defaultSourceId = sources.find((source) => source.sourceType === 'video' || source.sourceType === 'image')?.id ?? sources[0]?.id;
const output = resolve(args.get('output') ?? positional[0] ?? outputs.outputVideo);
const publicRender = outputs.publicRender ? resolve(outputs.publicRender) : null;
const workDir = resolve(outputs.workDir ?? 'output/videos/local-ffmpeg-synced-work');
const subtitlePath = resolve(workDir, 'weekly-ai-short-synced.ass');
const srtPath = resolve(workDir, 'weekly-ai-short-synced.srt');
const concatListPath = resolve(workDir, 'voiceover-segments.txt');
const videoSegmentListPath = resolve(workDir, 'video-segments.txt');
const videoSegmentWorkDir = resolve(workDir, 'scene-segments');
const videoSegmentCacheDir = resolve('output/render-cache/scene-segments-v1');
const voiceoverPath = resolve(workDir, 'voiceover-synced.aiff');
const timelinePath = resolve(workDir, 'timeline.json');
const renderPlanPath = resolve(workDir, 'render-plan.json');
const manifestPath = resolve(workDir, 'render-manifest.json');
const previousManifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : null;
const projectFingerprint = createHash('sha256').update(briefText).digest('hex');

const width = Number(brief.render?.width ?? 1080);
const height = Number(brief.render?.height ?? 1920);
const fps = Number(brief.render?.fps ?? 30);
const voiceRenderConfig = {
  ...(brief.render ?? {}),
  ...(process.env.VOICEOVER_VOICE ? { voice: process.env.VOICEOVER_VOICE } : {}),
  ...(process.env.VOICEOVER_RATE ? { rate: Number(process.env.VOICEOVER_RATE) } : {}),
};
const voiceConfig = resolveVoiceoverConfig(voiceRenderConfig);
const { voice, rate } = voiceConfig;
const mediaFit = brief.render?.mediaFit === 'cover' ? 'cover' : 'contain';
const voiceGenerationMode = ['batch', 'per-scene'].includes(brief.render?.voiceGenerationMode)
  ? brief.render.voiceGenerationMode
  : 'auto';
const voiceAdapter = voiceConfig.engine;
const renderStrategy = (process.env.VIDEOBRIEF_RENDER_STRATEGY ?? brief.render?.renderStrategy) === 'monolithic'
  ? 'monolithic'
  : 'segmented-concat';
const sceneSpecs = (brief.scenes ?? [])
  .filter((scene) => scene.enabled !== false)
  .map((scene) => ({ ...scene, sourceId: scene.sourceId ?? defaultSourceId }));
const usedSourceIds = new Set(sceneSpecs.map((scene) => scene.sourceId));
const sourceInputs = sources
  .filter((source) => usedSourceIds.has(source.id))
  .map((source) => ({ ...source, path: resolve(source.assetPath) }));
const sourceIndexById = new Map(sourceInputs.map((source, index) => [source.id, index]));

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

function mediaDuration(path) {
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-i', path], { encoding: 'utf8' });
  const match = result.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Could not parse media duration for ${path}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function fileSha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function fileSha256Stream(path) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', rejectHash);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

function prepareVoiceSegment(scene, index, rawPath, voiceArtifact) {
  const paddedPath = resolve(workDir, `voice-padded-${String(index + 1).padStart(2, '0')}.aiff`);
  const subtitle = String(scene.subtitle ?? '').trim();
  const rawDuration = audioDuration(rawPath);
  let detectedSilences = [];
  try {
    detectedSilences = detectVoiceSilences(rawPath);
  } catch {
    // Duration-based subtitle timing remains available when silence detection fails.
  }
  const audibleWindow = resolveAudibleVoiceWindow({
    silences: detectedSilences,
    audioDuration: rawDuration,
  });
  const speechDuration = audibleWindow.duration;
  const voiceDuration = Math.max(1.8, speechDuration + 0.28);
  const source = sources.find((item) => item.id === scene.sourceId);
  const timing = resolveSceneTiming({
    sceneId: scene.id ?? `scene-${String(index + 1).padStart(2, '0')}`,
    sourceType: source?.sourceType,
    sourceStart: scene.sourceStart,
    sourceEnd: scene.sourceEnd,
    voiceDuration,
    fps,
  });
  const { duration } = timing;
  const narration = String(scene.narration ?? scene.subtitle ?? '').trim();
  const clauses = narration.match(/[^，。！？；：,.!?;:]+[，。！？；：,.!?;:]?/g)
    ?.map((part) => part.trim())
    .filter(Boolean) ?? [];
  const phrases = clauses.flatMap((clause) => wrapText(clause, 16).filter(Boolean));
  const subtitleSilences = detectedSilences
    .map((silence) => ({
      start: Math.max(0, silence.start - audibleWindow.start),
      end: Math.min(speechDuration, silence.end - audibleWindow.start),
      duration: silence.duration,
    }))
    .filter((silence) => silence.end > silence.start && silence.start < speechDuration);
  const subtitleCues = planSubtitleCues({
    phrases: phrases.length ? phrases : [narration],
    speechDuration,
    silences: subtitleSilences,
  });
  runFfmpeg(
    [
      '-y',
      '-i',
      rawPath,
      '-af',
      `atrim=start=${audibleWindow.start.toFixed(6)}:end=${audibleWindow.end.toFixed(6)},asetpts=PTS-STARTPTS,apad,atrim=0:${duration.toFixed(3)},aresample=48000,highpass=f=80,lowpass=f=12000,acompressor=threshold=0.125:ratio=2:attack=20:release=250`,
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
    sourceStart: timing.sourceStart,
    sourceEnd: timing.sourceEnd,
    renderSourceEnd: timing.renderSourceEnd,
    eyebrow: String(scene.eyebrow ?? ''),
    title: String(scene.title ?? ''),
    subtitle,
    rawPath,
    paddedPath,
    voiceArtifact,
    voiceTrim: {
      rawDuration,
      start: audibleWindow.start,
      end: audibleWindow.end,
      trimmed: audibleWindow.trimmed,
    },
    subtitleCues,
    speechDuration,
    duration,
    frameCount: timing.frameCount,
  };
}

async function generateVoiceSegment(scene, index) {
  const narration = String(scene.narration ?? scene.subtitle ?? '').trim();
  let generated;
  try {
    generated = await synthesizeVoiceover(narration, voiceRenderConfig);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Voice generation failed for ${scene.id ?? `scene-${index + 1}`}: ${message}`, {
      cause: error,
    });
  }
  const rawPath = resolve(workDir, `voice-${String(index + 1).padStart(2, '0')}.${generated.extension}`);
  copyFileSync(generated.path, rawPath);
  return prepareVoiceSegment(scene, index, rawPath, {
    generationMode: 'per-scene',
    cacheKey: generated.key,
    audioSha256: generated.metadata.audioSha256,
    cacheHit: generated.cacheHit,
    mimeType: generated.metadata.mimeType,
    sourceSampleRate: generated.metadata.sourceSampleRate,
  });
}

function detectVoiceSilences(path) {
  const result = spawnSync(
    ffmpegPath,
    [
      '-hide_banner',
      '-nostats',
      '-i', path,
      '-af', 'silencedetect=n=-35dB:d=0.2',
      '-f', 'null',
      '-',
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`Failed to detect batch voiceover pauses: ${result.stderr || result.stdout}`);
  }
  return parseSilenceIntervals(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
}

async function generateBatchVoiceSegments(sceneEntries, batchId = 'full-video') {
  const narration = sceneEntries
    .map((scene) => String(scene.narration ?? scene.subtitle ?? '').trim())
    .join(' ');
  let generated;
  try {
    generated = await synthesizeVoiceover(narration, voiceRenderConfig);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Batch voice generation failed for ${sceneEntries.length} scenes: ${message}`, {
      cause: error,
    });
  }

  const safeBatchId = String(batchId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const batchRawPath = resolve(workDir, `voice-batch-${safeBatchId}.${generated.extension}`);
  copyFileSync(generated.path, batchRawPath);
  const batchDuration = audioDuration(batchRawPath);
  const silences = detectVoiceSilences(batchRawPath);
  const segmentPlans = planVoiceSegments({
    silences,
    audioDuration: batchDuration,
    segmentCount: sceneEntries.length,
    segmentWeights: sceneEntries.map((scene) => Array.from(
      String(scene.narration ?? scene.subtitle ?? '').replace(/\s/g, ''),
    ).length),
  });
  const scenes = segmentPlans.map((segment, localIndex) => {
    const scene = sceneEntries[localIndex];
    const index = sceneSpecs.findIndex((item) => item.id === scene.id);
    if (index < 0) throw new Error(`Voice batch ${batchId} contains unknown scene ${scene.id}.`);
    const rawPath = resolve(workDir, `voice-${String(index + 1).padStart(2, '0')}.wav`);
    runFfmpeg(
      [
        '-y',
        '-i', batchRawPath,
        '-af', `atrim=start=${segment.start.toFixed(6)}:end=${segment.end.toFixed(6)},asetpts=PTS-STARTPTS`,
        '-c:a', 'pcm_s16le',
        rawPath,
      ],
      `Failed to extract batch voice segment ${index + 1}.`,
    );
    return prepareVoiceSegment(scene, index, rawPath, {
      generationMode: 'batch-silence-split',
      batchCacheKey: generated.key,
      batchAudioSha256: generated.metadata.audioSha256,
      audioSha256: fileSha256(rawPath),
      cacheHit: generated.cacheHit,
      mimeType: 'audio/wav',
      sourceSampleRate: generated.metadata.sourceSampleRate,
      segmentStart: segment.start,
      segmentEnd: segment.end,
    });
  });

  return {
    scenes,
    batchArtifact: {
      batchId,
      cacheKey: generated.key,
      path: batchRawPath,
      audioSha256: generated.metadata.audioSha256,
      textSha256: createHash('sha256').update(narration).digest('hex'),
      cacheHit: generated.cacheHit,
      duration: batchDuration,
      silenceThresholdDb: -35,
      silenceDetectionSeconds: 0.2,
      minimumBoundarySilenceSeconds: 0.75,
      segmentationMode: 'silence-text-weight-aligned',
      detectedSilences: silences,
      segments: segmentPlans.map(({ index, start, end, duration }) => ({ index, start, end, duration })),
    },
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

function characterWidth(character) {
  return /^[\x00-\x7F]$/.test(character) ? 0.55 : 1;
}

function wrapText(text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    let line = '';
    let width = 0;
    for (const character of Array.from(paragraph)) {
      const nextWidth = characterWidth(character);
      const cannotStartLine = /^[，。！？；：、,.!?;:)）\]】]$/.test(character);
      if (line && width + nextWidth > maxWidth && cannotStartLine) {
        line += character;
        width += nextWidth;
        continue;
      }
      if (line && width + nextWidth > maxWidth) {
        lines.push(line.trimEnd());
        line = character.trimStart();
        width = line ? nextWidth : 0;
      } else {
        line += character;
        width += nextWidth;
      }
    }
    lines.push(line);
  }
  return lines;
}

function assText(text, maxWidth) {
  return wrapText(text, maxWidth)
    .map((line) => line.replaceAll('\\', '\\\\').replaceAll('{', '\\{').replaceAll('}', '\\}'))
    .join('\\N');
}

function buildTimeline(scenes) {
  let cursor = 0;
  return scenes.map((scene) => {
    const start = cursor;
    const end = start + scene.duration;
    cursor = end;
    return {
      ...scene,
      start,
      end,
      speechStart: start,
      speechEnd: Math.min(end, start + scene.speechDuration),
    };
  });
}

function buildSrt(scenes) {
  const cues = scenes.flatMap((scene) => scene.subtitleCues.map((cue) => ({
    start: scene.start + cue.start,
    end: scene.start + cue.end,
    text: cue.text,
  })));
  return (
    cues
      .map((cue, index) =>
        [
          String(index + 1),
          `${srtTime(cue.start)} --> ${srtTime(cue.end)}`,
          cue.text,
          '',
        ].join('\n'),
      )
      .join('\n') + '\n'
  );
}

function buildAss(scenes) {
  const horizontal = width > height;
  const square = width === height;
  const eyebrowFontSize = horizontal ? 30 : square ? 32 : 34;
  const titleFontSize = horizontal ? 52 : square ? 54 : 58;
  const subtitleFontSize = horizontal ? 36 : square ? 38 : 42;
  const sideMargin = horizontal ? 72 : 78;
  const titleTop = horizontal ? 18 : square ? 96 : 126;
  const subtitleBottom = horizontal ? 50 : square ? 70 : 116;
  const titleWidth = horizontal ? 30 : square ? 22 : 15;
  const subtitleWidth = horizontal ? 42 : square ? 30 : 21;
  const dialogue = scenes.flatMap((scene) => {
    const start = assTime(scene.start);
    const end = assTime(scene.end);
    const editorialOverlay = scene.showEditorialOverlay === false ? [] : [
      `Dialogue: 0,${start},${end},Eyebrow,,0,0,0,,${assText(scene.eyebrow, titleWidth)}`,
      `Dialogue: 0,${start},${end},Title,,0,0,0,,${assText(scene.title, titleWidth)}`,
    ];
    const subtitleDialogue = scene.subtitleCues.map((cue) => (
      `Dialogue: 0,${assTime(scene.start + cue.start)},${assTime(scene.start + cue.end)},Subtitle,,0,0,0,,${assText(cue.text, subtitleWidth)}`
    ));
    return [
      ...editorialOverlay,
      ...subtitleDialogue,
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
    `Style: Eyebrow,Hiragino Sans GB,${eyebrowFontSize},&H00E5FFF7,&H000000FF,&H96000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,1,7,${sideMargin},${sideMargin},${titleTop},1`,
    `Style: Title,Hiragino Sans GB,${titleFontSize},&H00FFFFFF,&H000000FF,&HB0000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,1,7,${sideMargin},${sideMargin},${titleTop + eyebrowFontSize + 18},1`,
    `Style: Subtitle,Hiragino Sans GB,${subtitleFontSize},&H00FFFFFF,&H000000FF,&HD0000000,&HAA000000,-1,0,0,0,100,100,0,0,3,2,0,2,${sideMargin},${sideMargin},${subtitleBottom},1`,
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
      '-af',
      'aresample=48000,loudnorm=I=-16:LRA=11:TP=-2.0',
      '-ar',
      '48000',
      '-ac',
      '2',
      voiceoverPath,
    ],
    'Failed to concatenate voiceover segments.',
  );
}

async function buildMonolithicVideoRenderPlan(scenes) {
  const topBand = width > height ? Math.round(height * 0.12) : 0;
  const bottomBand = width > height ? Math.round(height * 0.18) : 0;
  const mediaHeight = height - topBand - bottomBand;
  const fit = mediaFit === 'cover'
    ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
    : width > height
      ? `scale=${width}:${mediaHeight}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh+${topBand}-${bottomBand}-ih)/2:color=0x080b10`
      : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x080b10`;
  const branches = planVideoInputBranches(scenes, sourceIndexById);
  const trims = scenes.map((scene, index) => {
    const sourceIndex = sourceIndexById.get(scene.sourceId);
    if (sourceIndex == null) throw new Error(`Unknown sourceId ${scene.sourceId} in ${scene.id}.`);
    const source = sourceInputs[sourceIndex];
    if (source.sourceType === 'image') {
      return [
        `[${branches.sceneInputLabels[index]}]${fit}`,
        `fps=${fps}`,
        `trim=end_frame=${scene.frameCount}`,
        'setpts=PTS-STARTPTS',
        'setsar=1',
        `format=yuv420p[v${index}]`,
      ].join(',');
    }
    return [
      `[${branches.sceneInputLabels[index]}]trim=start=${scene.sourceStart}:end=${scene.sourceEnd}`,
      'setpts=PTS-STARTPTS',
      fit,
      `fps=${fps}`,
      `trim=end_frame=${scene.frameCount}`,
      'setpts=PTS-STARTPTS',
      'setsar=1',
      `format=yuv420p[v${index}]`,
    ].join(',');
  });

  const concatInputs = scenes.map((_, index) => `[v${index}]`).join('');
  const subtitles = `subtitles='${filterPath(subtitlePath)}':fontsdir='${filterPath('/System/Library/Fonts')}'`;

  const concatFilter = `${concatInputs}concat=n=${scenes.length}:v=1:a=0,drawbox=x=0:y=${Math.round(height * (width > height ? 0.82 : 0.802))}:w=${width}:h=${Math.round(height * (width > height ? 0.18 : 0.198))}:color=black@0.82:t=fill,${subtitles},format=yuv420p[vout]`;
  const filterComplex = [
    ...branches.filters,
    ...trims,
    concatFilter,
  ].join(';');
  const inputs = await Promise.all(sourceInputs.map(async (source, index) => ({
    inputIndex: index,
    sourceId: source.id,
    sourceType: source.sourceType,
    assetPath: source.assetPath,
    resolvedPath: source.path,
    contentSha256: await fileSha256Stream(source.path),
  })));
  const expectedDuration = scenes.at(-1).end;
  const ffmpegArgs = [
    '-y',
    ...sourceInputs.flatMap((source) => source.sourceType === 'image'
      ? ['-loop', '1', '-framerate', String(fps), '-i', source.path]
      : ['-i', source.path]),
    '-i',
    voiceoverPath,
    '-filter_complex',
    filterComplex,
    '-map',
    '[vout]',
    '-map',
    `${sourceInputs.length}:a:0`,
    '-t',
    expectedDuration.toFixed(3),
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
  ];
  return {
    schemaVersion: 2,
    projectId: brief.id,
    projectFingerprint,
    briefPath,
    generatedAt: new Date().toISOString(),
    expectedDuration,
    render: { width, height, fps, mediaFit },
    inputs,
    scenes: scenes.map((scene, index) => ({
      index,
      id: scene.id,
      sourceId: scene.sourceId,
      sourceStart: scene.sourceStart,
      sourceEnd: scene.sourceEnd,
      renderSourceEnd: scene.renderSourceEnd,
      frameCount: scene.frameCount,
      outputStart: scene.start,
      outputEnd: scene.end,
      inputLabel: branches.sceneInputLabels[index],
    })),
    graph: {
      sourceFilters: branches.filters,
      sceneFilters: trims,
      concatFilter,
      filterComplex,
      filterComplexSha256: createHash('sha256').update(filterComplex).digest('hex'),
    },
    command: {
      executable: ffmpegPath,
      args: ffmpegArgs,
      argsSha256: createHash('sha256').update(JSON.stringify(ffmpegArgs)).digest('hex'),
      audioInputPath: voiceoverPath,
      outputPath: output,
    },
  };
}

function readReusableSegmentMetadata(metadataPath, segmentPath, cacheKey) {
  if (!existsSync(metadataPath) || !existsSync(segmentPath) || statSync(segmentPath).size === 0) return null;
  try {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    const segmentSha256 = fileSha256(segmentPath);
    return segmentCacheIsReusable(metadata, cacheKey, segmentSha256)
      ? { metadata, segmentSha256 }
      : null;
  } catch {
    return null;
  }
}

function atomicWriteJson(path, value) {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporaryPath, path);
}

async function renderSegmentedVideo(scenes) {
  const topBand = width > height ? Math.round(height * 0.12) : 0;
  const bottomBand = width > height ? Math.round(height * 0.18) : 0;
  const mediaHeight = height - topBand - bottomBand;
  const fit = mediaFit === 'cover'
    ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
    : width > height
      ? `scale=${width}:${mediaHeight}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh+${topBand}-${bottomBand}-ih)/2:color=0x080b10`
      : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x080b10`;
  const sourceRecords = await Promise.all(sourceInputs.map(async (source, index) => ({
    inputIndex: index,
    sourceId: source.id,
    sourceType: source.sourceType,
    assetPath: source.assetPath,
    resolvedPath: source.path,
    contentSha256: await fileSha256Stream(source.path),
  })));
  const sourceRecordById = new Map(sourceRecords.map((source) => [source.sourceId, source]));

  mkdirSync(videoSegmentWorkDir, { recursive: true });
  mkdirSync(videoSegmentCacheDir, { recursive: true });
  const segmentPlans = [];
  const failAfterSegments = Number(process.env.VIDEOBRIEF_FAIL_AFTER_SEGMENTS ?? 0);

  for (const [index, scene] of scenes.entries()) {
    const source = sourceInputs.find((item) => item.id === scene.sourceId);
    const sourceRecord = sourceRecordById.get(scene.sourceId);
    if (!source || !sourceRecord) throw new Error(`Unknown sourceId ${scene.sourceId} in ${scene.id}.`);

    const safeSceneId = String(scene.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const localSubtitlePath = resolve(videoSegmentWorkDir, `${String(index + 1).padStart(3, '0')}-${safeSceneId}.ass`);
    writeFileSync(localSubtitlePath, buildAss([{
      ...scene,
      start: 0,
      end: scene.duration,
      speechStart: 0,
      speechEnd: Math.min(scene.duration, scene.speechDuration),
    }]));

    const audioSha256 = fileSha256(scene.paddedPath);
    const descriptor = {
      ...(process.env.VIDEOBRIEF_SEGMENT_CACHE_SALT
        ? { cacheSalt: process.env.VIDEOBRIEF_SEGMENT_CACHE_SALT }
        : {}),
      source: {
        sha256: sourceRecord.contentSha256,
        type: source.sourceType,
        start: scene.sourceStart,
        end: scene.sourceEnd,
        renderEnd: scene.renderSourceEnd,
      },
      audioSha256,
      render: { width, height, fps, fit: mediaFit },
      presentation: {
        eyebrow: scene.eyebrow,
        title: scene.title,
        subtitle: scene.subtitle,
        showEditorialOverlay: scene.showEditorialOverlay !== false,
      },
      duration: scene.duration,
      frameCount: scene.frameCount,
    };
    const cacheKey = segmentRenderCacheKey(descriptor);
    const segmentPath = resolve(videoSegmentCacheDir, `${cacheKey}.mp4`);
    const metadataPath = resolve(videoSegmentCacheDir, `${cacheKey}.json`);
    const subtitles = `subtitles='${filterPath(localSubtitlePath)}':fontsdir='${filterPath('/System/Library/Fonts')}'`;
    const videoPrefix = source.sourceType === 'image'
      ? `[0:v]${fit},fps=${fps},trim=end_frame=${scene.frameCount},setpts=PTS-STARTPTS`
      : `[0:v]trim=start=${scene.sourceStart}:end=${scene.sourceEnd},setpts=PTS-STARTPTS,${fit},fps=${fps},trim=end_frame=${scene.frameCount},setpts=PTS-STARTPTS`;
    const filterComplex = [
      `${videoPrefix},setsar=1,format=yuv420p,drawbox=x=0:y=${Math.round(height * (width > height ? 0.82 : 0.802))}:w=${width}:h=${Math.round(height * (width > height ? 0.18 : 0.198))}:color=black@0.82:t=fill,${subtitles},format=yuv420p[vout]`,
      `[1:a]atrim=0:${scene.duration.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000[aout]`,
    ].join(';');
    const temporarySegmentPath = `${segmentPath}.tmp-${process.pid}-${index}.mp4`;
    const commandArgs = [
      '-y',
      ...(source.sourceType === 'image' ? ['-loop', '1', '-framerate', String(fps)] : []),
      '-i', source.path,
      '-i', scene.paddedPath,
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      '-map', '[aout]',
      '-frames:v', String(scene.frameCount),
      '-t', scene.duration.toFixed(3),
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '18',
      '-profile:v', 'high',
      '-level', '4.2',
      '-pix_fmt', 'yuv420p',
      '-r', String(fps),
      '-g', String(fps * 2),
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-movflags', '+faststart',
      temporarySegmentPath,
    ];

    const reusable = readReusableSegmentMetadata(metadataPath, segmentPath, cacheKey);
    let cacheHit = Boolean(reusable);
    let segmentSha256 = reusable?.segmentSha256 ?? '';
    let createdFrom = reusable?.metadata?.createdFrom ?? null;
    if (!reusable) {
      runFfmpeg(commandArgs, `Failed to render scene segment ${scene.id}.`);
      renameSync(temporarySegmentPath, segmentPath);
      segmentSha256 = fileSha256(segmentPath);
      createdFrom = {
        filterComplex,
        filterComplexSha256: createHash('sha256').update(filterComplex).digest('hex'),
        command: {
          executable: ffmpegPath,
          args: commandArgs,
          argsSha256: createHash('sha256').update(JSON.stringify(commandArgs)).digest('hex'),
        },
      };
      atomicWriteJson(metadataPath, {
        schemaVersion: 1,
        rendererVersion: SEGMENT_RENDERER_VERSION,
        cacheKey,
        segmentPath,
        segmentSha256,
        descriptor,
        createdAt: new Date().toISOString(),
        createdFrom,
      });
      cacheHit = false;
    }

    segmentPlans.push({
      index,
      id: scene.id,
      sourceId: scene.sourceId,
      sourceStart: scene.sourceStart,
      sourceEnd: scene.sourceEnd,
      renderSourceEnd: scene.renderSourceEnd,
      frameCount: scene.frameCount,
      outputStart: scene.start,
      outputEnd: scene.end,
      cacheKey,
      cacheHit,
      segmentPath,
      segmentSha256,
      metadataPath,
      descriptor,
      createdFrom,
    });

    if (Number.isInteger(failAfterSegments) && failAfterSegments > 0 && index + 1 >= failAfterSegments) {
      throw new Error(`Injected render interruption after ${index + 1} scene segment(s).`);
    }
  }

  writeFileSync(
    videoSegmentListPath,
    segmentPlans.map((segment) => `file '${concatFilePath(segment.segmentPath)}'`).join('\n') + '\n',
  );
  const temporaryOutputPath = `${output}.tmp-${process.pid}.mp4`;
  const concatArgs = [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', videoSegmentListPath,
    '-c:v', 'copy',
    '-af', 'loudnorm=I=-16:LRA=11:TP=-2.0',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-movflags', '+faststart',
    temporaryOutputPath,
  ];
  runFfmpeg(concatArgs, 'Failed to concatenate cached scene segments.');
  renameSync(temporaryOutputPath, output);

  return {
    schemaVersion: 3,
    strategy: 'segmented-concat',
    rendererVersion: SEGMENT_RENDERER_VERSION,
    projectId: brief.id,
    projectFingerprint,
    briefPath,
    generatedAt: new Date().toISOString(),
    expectedDuration: scenes.at(-1).end,
    render: { width, height, fps, mediaFit },
    inputs: sourceRecords,
    scenes: segmentPlans,
    concat: {
      listPath: videoSegmentListPath,
      listSha256: fileSha256(videoSegmentListPath),
      command: {
        executable: ffmpegPath,
        args: concatArgs,
        argsSha256: createHash('sha256').update(JSON.stringify(concatArgs)).digest('hex'),
        temporaryOutputPath,
        outputPath: output,
      },
    },
    command: {
      executable: ffmpegPath,
      args: concatArgs,
      argsSha256: createHash('sha256').update(JSON.stringify(concatArgs)).digest('hex'),
      outputPath: output,
    },
  };
}

if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path.');
for (const source of sourceInputs) {
  if (!source.assetPath) throw new Error(`Source ${source.id} is missing assetPath.`);
  if (!existsSync(source.path)) throw new Error(`Source video not found: ${source.path}`);
}
const sourceDurationById = new Map(sourceInputs.flatMap((source) => (
  source.sourceType === 'video' ? [[source.id, mediaDuration(source.path)]] : []
)));
if (!sceneSpecs.length) throw new Error(`No enabled scenes found in ${briefPath}`);
for (const scene of sceneSpecs) {
  const source = sources.find((item) => item.id === scene.sourceId);
  if (!source) throw new Error(`Scene ${scene.id} references unknown sourceId ${scene.sourceId}.`);
  if (source.sourceType !== 'video' && source.sourceType !== 'image') {
    throw new Error(`Scene ${scene.id} requires a video or image source; ${source.id} is ${source.sourceType}.`);
  }
  if (source.sourceType === 'video') {
    validateVideoWindow({
      sceneId: scene.id,
      sourceDuration: sourceDurationById.get(source.id),
      sourceStart: scene.sourceStart,
      sourceEnd: scene.sourceEnd,
    });
  }
  if (Array.isArray(scene.candidates) && scene.candidates.length > 0 && !scene.selectedCandidateId) {
    throw new Error(`Scene ${scene.id} has candidates but no user-confirmed selectedCandidateId.`);
  }
  if (scene.selectedCandidateId) {
    const selected = scene.candidates?.find((candidate) => candidate.id === scene.selectedCandidateId);
    if (!selected) throw new Error(`Scene ${scene.id} selectedCandidateId does not exist in candidates.`);
    if (
      selected.sourceId !== scene.sourceId
      || selected.sourceStart !== scene.sourceStart
      || selected.sourceEnd !== scene.sourceEnd
    ) {
      throw new Error(`Scene ${scene.id} selected candidate does not exactly match sourceId/sourceStart/sourceEnd.`);
    }
  }
  if (scene.selectionStatus !== 'codex_reviewed' && scene.selectionStatus !== 'user_approved') {
    throw new Error(`Scene ${scene.id} selection is ${scene.selectionStatus || 'unselected'}; Codex or user review is required before production render.`);
  }
}

const plannedDurationSeconds = Number(brief.brief?.targetDurationSeconds) || sceneSpecs.reduce(
  (total, scene) => total + Math.max(
    1,
    Number(scene.duration) || Number(scene.sourceEnd) - Number(scene.sourceStart) || 0,
  ),
  0,
);
const renderCapacity = assertRenderCapacity(dirname(output), {
  durationSeconds: plannedDurationSeconds,
  width,
  height,
  fps,
  sceneCount: sceneSpecs.length,
  renderStrategy,
  publicRender: Boolean(publicRender),
});

mkdirSync(dirname(output), { recursive: true });
mkdirSync(workDir, { recursive: true });
if (publicRender) mkdirSync(dirname(publicRender), { recursive: true });

let scenesWithAudio = [];
const voiceBatchArtifacts = [];
const voiceBatchFallbacks = [];
if (
  voiceConfig.engine === 'gemini-tts'
  && sceneSpecs.length > 1
  && voiceGenerationMode !== 'per-scene'
) {
  const batches = planVoiceoverBatches(
    sceneSpecs,
    brief.chapters ?? [],
    brief.brief?.targetDurationSeconds,
  );
  for (const batchPlan of batches) {
    const batchScenes = batchPlan.entries.map((entry) => entry.scene);
    try {
      const batch = await generateBatchVoiceSegments(batchScenes, batchPlan.id);
      scenesWithAudio.push(...batch.scenes);
      voiceBatchArtifacts.push(batch.batchArtifact);
    } catch (error) {
      if (!shouldFallbackBatchVoiceover(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      voiceBatchFallbacks.push({
        batchId: batchPlan.id,
        chapterId: batchPlan.chapterId,
        attemptedMode: 'batch-silence-split',
        fallbackMode: 'per-scene',
        reason: message,
        occurredAt: new Date().toISOString(),
      });
      console.warn(`[videobrief-voice] Gemini batch ${batchPlan.id} failed; retrying its scenes: ${message}`);
      for (const { scene, index } of batchPlan.entries) {
        scenesWithAudio.push(await generateVoiceSegment(scene, index));
      }
    }
  }
} else {
  for (const [index, scene] of sceneSpecs.entries()) {
    scenesWithAudio.push(await generateVoiceSegment(scene, index));
  }
}
scenesWithAudio.sort((left, right) => (
  sceneSpecs.findIndex((scene) => scene.id === left.id)
  - sceneSpecs.findIndex((scene) => scene.id === right.id)
));
const scenes = buildTimeline(scenesWithAudio);
const duration = scenes.at(-1).end;
const durationContract = assertRenderedDuration(brief.brief?.targetDurationSeconds, duration);

buildVoiceover(scenes);
writeFileSync(subtitlePath, buildAss(scenes));
writeFileSync(srtPath, buildSrt(scenes));
const renderPlan = renderStrategy === 'monolithic'
  ? await buildMonolithicVideoRenderPlan(scenes)
  : await renderSegmentedVideo(scenes);
writeFileSync(renderPlanPath, `${JSON.stringify(renderPlan, null, 2)}\n`);
const chapterFingerprints = buildChapterFingerprints({
  project: brief,
  renderPlan,
  renderSettings: { width, height, fps, mediaFit, renderStrategy },
  voiceSettings: {
    engine: voiceConfig.engine,
    model: voiceConfig.model,
    voice: voiceConfig.voice,
    rate,
    profile: voiceConfig.profile,
    style: voiceConfig.style,
    pronunciations: voiceConfig.pronunciations,
    generationMode: voiceGenerationMode,
  },
});
const semanticReviewReuse = buildSemanticReviewReuse(previousManifest, chapterFingerprints);

if (renderStrategy === 'monolithic') {
  runFfmpeg(
    renderPlan.command.args,
    'Failed to render synced local short video.',
  );
}

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
  renderPlan: renderPlanPath,
  ...(renderStrategy === 'segmented-concat' ? { videoSegmentList: videoSegmentListPath } : {}),
  ...(voiceBatchArtifacts.length === 1 ? { voiceoverBatch: voiceBatchArtifacts[0].path } : {}),
  ...(voiceBatchArtifacts.length > 1
    ? { voiceoverBatches: voiceBatchArtifacts.map((batch) => batch.path) }
    : {}),
};
const manifest = {
  schemaVersion: 1,
  renderContractVersion: renderPlan.schemaVersion,
  projectId: brief.id,
  projectFingerprint,
  renderProjectFingerprint: projectFingerprint,
  renderedAt: new Date().toISOString(),
  briefPath,
  render: {
    width,
    height,
    fps,
    duration,
    voice,
    rate,
    voiceAdapter,
    voiceEngine: voiceConfig.engine,
    voiceModel: voiceConfig.model,
    voiceProfile: voiceConfig.profile,
    voiceStyle: voiceConfig.style,
    voiceGenerationMode,
    renderStrategy,
    pronunciations: voiceConfig.pronunciations,
    mediaFit,
    durationContract,
  },
  voiceover: {
    engine: voiceConfig.engine,
    model: voiceConfig.model,
    voice: voiceConfig.voice,
    profile: voiceConfig.profile,
    style: voiceConfig.style,
    generationModeRequested: voiceGenerationMode,
    pronunciations: voiceConfig.pronunciations,
    ...(voiceBatchArtifacts.length === 1 ? { batch: voiceBatchArtifacts[0] } : {}),
    ...(voiceBatchArtifacts.length > 1 ? { batches: voiceBatchArtifacts } : {}),
    ...(voiceBatchFallbacks.length === 1 ? { batchFallback: voiceBatchFallbacks[0] } : {}),
    ...(voiceBatchFallbacks.length > 1 ? { batchFallbacks: voiceBatchFallbacks } : {}),
    segments: scenes.map((scene) => ({ sceneId: scene.id, ...scene.voiceArtifact })),
  },
  artifacts,
  renderInputs: renderPlan.inputs,
  resourceBudget: {
    renderDisk: renderCapacity,
  },
  chapterFingerprints,
  semanticReviewReuse,
  renderPlanSha256: fileSha256(renderPlanPath),
  renderCommandSha256: renderPlan.command.argsSha256,
  scenes: scenes.map((scene) => ({
    id: scene.id,
    chapterId: scene.chapterId ?? '',
    sourceId: scene.sourceId,
    start: scene.start,
    end: scene.end,
    sourceStart: scene.sourceStart,
    sourceEnd: scene.sourceEnd,
    renderSourceEnd: scene.renderSourceEnd,
    frameCount: scene.frameCount,
    showEditorialOverlay: scene.showEditorialOverlay !== false,
    ...(renderStrategy === 'segmented-concat'
      ? {
          segmentCacheKey: renderPlan.scenes.find((item) => item.id === scene.id)?.cacheKey,
          segmentCacheHit: renderPlan.scenes.find((item) => item.id === scene.id)?.cacheHit,
          segmentPath: renderPlan.scenes.find((item) => item.id === scene.id)?.segmentPath,
          segmentSha256: renderPlan.scenes.find((item) => item.id === scene.id)?.segmentSha256,
        }
      : {}),
  })),
  productionMetrics: {
    renderCache: {
      strategy: renderStrategy,
      sceneSegments: scenes.length,
      sceneSegmentCacheHits: renderStrategy === 'segmented-concat'
        ? renderPlan.scenes.filter((scene) => scene.cacheHit).length
        : 0,
      sceneSegmentCacheMisses: renderStrategy === 'segmented-concat'
        ? renderPlan.scenes.filter((scene) => !scene.cacheHit).length
        : scenes.length,
      finalVideoReencoded: renderStrategy !== 'segmented-concat',
      finalAudioReencoded: true,
    },
    stages: {
      render: {
        startedAt: renderProcessStartedAt.toISOString(),
        completedAt: new Date().toISOString(),
        wallMs: Date.now() - renderProcessStartedAt.getTime(),
      },
    },
  },
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
