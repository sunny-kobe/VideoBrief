import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readAiConfig } from './aiConfig';
import {
  analyzeImageSource,
  analyzeTextSource,
  analyzeVideoSource,
} from './aiProvider';
import { readLocalTranscriptionConfig, transcribeAudioLocally } from './localTranscriptionServer';
import type { SourceUnderstanding } from './aiSchemas';
import type {
  AiCallRecord,
  ResearchFact,
  ResearchUncertainty,
  ShortVideoProject,
  ShortVideoSource,
  SourceAnalysis,
  SourceReference,
  TranscriptSegment,
} from './shortVideoBrief';
import {
  readBrief,
  updateCanonicalProject,
} from './shortVideoProjectServer';

function fileHash(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function resolveSourceAssetPath(assetPath: string) {
  const normalized = assetPath.replaceAll('\\', '/').replace(/^\.\//, '');
  const allowedRoots = ['public/project-assets/', 'public/source-clips/'] as const;
  const root = allowedRoots.find((candidate) => normalized.startsWith(candidate));
  if (!root || normalized.includes('/../')) {
    throw new Error('资料处理只允许读取项目导入素材和兼容 fixture 素材。');
  }
  const relativePath = normalized.slice(root.length);
  return root === 'public/project-assets/'
    ? join(process.cwd(), 'public', 'project-assets', relativePath)
    : join(process.cwd(), 'public', 'source-clips', relativePath);
}

interface MediaProbe {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

interface RepresentativeFrame {
  path: string;
  second: number;
  ratio: number;
}

interface SpawnResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
  stdout?: string | Buffer | null;
  stderr?: string | Buffer | null;
}

function transcriptionPrompt(project: ShortVideoProject, source: ShortVideoSource) {
  return [
    project.title,
    source.label,
    'VideoBrief',
    'Creative Brief',
    '资料理解',
    '脚本',
    '候选画面',
    '人工确认',
    '技术验收',
    '权利状态',
    '发布状态',
  ].map((value) => value.trim()).filter(Boolean).join('，').slice(0, 500);
}

function finiteNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveFfmpegBinary() {
  const workspaceBinary = join(
    process.cwd(),
    'node_modules',
    'ffmpeg-static',
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
  );
  if (existsSync(workspaceBinary)) return workspaceBinary;
  throw new Error(`ffmpeg-static binary does not exist: ${workspaceBinary}`);
}

function spawnFailureDetails(result: SpawnResult) {
  const stderr = String(result.stderr ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6)
    .join(' ');
  return [
    result.error?.message,
    stderr,
    result.status == null ? '' : `exit=${result.status}`,
    result.signal ? `signal=${result.signal}` : '',
  ].filter(Boolean).join('；') || '未返回可诊断信息';
}

function probeMedia(path: string): MediaProbe {
  const ffmpegBinary = resolveFfmpegBinary();
  const ffprobePath = resolve('scripts/hyperframes-ffmpeg/ffprobe');
  if (existsSync(ffprobePath)) {
    const structuredProbe = spawnSync(
      ffprobePath,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
      { encoding: 'utf8' },
    );
    if (structuredProbe.status === 0) {
      try {
        const data = JSON.parse(structuredProbe.stdout || '{}') as {
          streams?: Array<{ codec_type?: string; duration?: string; width?: number; height?: number }>;
          format?: { duration?: string };
        };
        const streams = Array.isArray(data.streams) ? data.streams : [];
        const video = streams.find((stream) => stream.codec_type === 'video');
        const audio = streams.find((stream) => stream.codec_type === 'audio');
        if (video || audio) {
          return {
            duration: finiteNumber(data.format?.duration) || finiteNumber(video?.duration) || finiteNumber(audio?.duration),
            width: finiteNumber(video?.width),
            height: finiteNumber(video?.height),
            hasAudio: Boolean(audio),
            hasVideo: Boolean(video),
          };
        }
      } catch {
        // Fall through to FFmpeg's broader demuxer support.
      }
    }
  }

  const probe = spawnSync(ffmpegBinary, ['-hide_banner', '-i', path], { encoding: 'utf8' });
  const output = `${probe.stdout ?? ''}\n${probe.stderr ?? ''}`;
  const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const resolutionMatch = output.match(/Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/);
  const fallback = {
    duration: durationMatch
      ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
      : 0,
    width: resolutionMatch ? Number(resolutionMatch[1]) : 0,
    height: resolutionMatch ? Number(resolutionMatch[2]) : 0,
    hasAudio: /Stream #\d+:\d+(?:\([^)]*\))?: Audio:/.test(output),
    hasVideo: /Stream #\d+:\d+(?:\([^)]*\))?: Video:/.test(output),
  };
  if (!fallback.hasAudio && !fallback.hasVideo) {
    throw new Error(`媒体探测失败：${spawnFailureDetails(probe)}`);
  }
  return fallback;
}

function updateSource(
  project: ShortVideoProject,
  sourceId: string,
  updater: (source: ShortVideoSource) => ShortVideoSource,
) {
  return {
    ...project,
    sources: project.sources.map((source) => source.id === sourceId ? updater(source) : source),
  };
}

function rebuildResearch(project: ShortVideoProject) {
  return {
    ...project,
    research: {
      transcripts: project.sources.flatMap((source) => source.analysis.transcript),
      facts: project.sources.flatMap((source) => source.analysis.facts),
      uncertainties: project.sources.flatMap((source) => source.analysis.uncertainties),
    },
  };
}

function remapReusedAnalysis(sourceId: string, analysis: SourceAnalysis): SourceAnalysis {
  const remapReferences = (references: SourceReference[]) => references.map((reference) => ({
    ...reference,
    sourceId,
  }));
  return {
    extractedText: analysis.extractedText,
    visualDescription: analysis.visualDescription,
    transcript: analysis.transcript.map((segment, index) => ({
      ...segment,
      id: `${sourceId}-segment-${String(index + 1).padStart(2, '0')}`,
      sourceId,
    })),
    facts: analysis.facts.map((fact, index) => ({
      ...fact,
      id: `${sourceId}-fact-${String(index + 1).padStart(2, '0')}`,
      sourceReferences: remapReferences(fact.sourceReferences),
      reviewStatus: 'proposed',
    })),
    uncertainties: analysis.uncertainties.map((item, index) => ({
      ...item,
      id: `${sourceId}-uncertainty-${String(index + 1).padStart(2, '0')}`,
      sourceReferences: remapReferences(item.sourceReferences),
      resolution: '',
    })),
  };
}

function completedReusedSource(source: ShortVideoSource, contentHash: string) {
  if (!source.reusedFrom) return undefined;
  try {
    return readBrief(source.reusedFrom.projectId).sources.find((candidate) => (
      candidate.id === source.reusedFrom?.sourceId &&
      candidate.contentHash === contentHash &&
      candidate.processing.status === 'completed'
    ));
  } catch {
    return undefined;
  }
}

function referenceFromAi(reference: SourceUnderstanding['facts'][number]['sourceReferences'][number]): SourceReference {
  return {
    sourceId: reference.sourceId,
    locatorType: reference.locatorType,
    ...(reference.start == null ? {} : { start: reference.start }),
    ...(reference.end == null ? {} : { end: reference.end }),
    ...(reference.lineStart == null ? {} : { lineStart: reference.lineStart }),
    ...(reference.lineEnd == null ? {} : { lineEnd: reference.lineEnd }),
    note: reference.note,
  };
}

function factsFromAi(sourceId: string, result: SourceUnderstanding): ResearchFact[] {
  const requiredIndexes = new Set(result.facts
    .map((fact, index) => ({ fact, index }))
    .filter(({ fact }) => fact.kind === 'claim' && fact.reviewPriority === 'required')
    .sort((left, right) => right.fact.briefRelevance - left.fact.briefRelevance)
    .slice(0, 3)
    .map(({ index }) => index));
  return result.facts.map((fact, index) => ({
    id: `${sourceId}-fact-${String(index + 1).padStart(2, '0')}`,
    statement: fact.statement,
    sourceReferences: fact.sourceReferences.map(referenceFromAi),
    reviewStatus: 'proposed',
    kind: fact.kind,
    reviewPriority: fact.kind === 'visual_metadata'
      ? 'reference'
      : fact.reviewPriority === 'required' && !requiredIndexes.has(index)
        ? 'supporting'
        : fact.reviewPriority,
    briefRelevance: fact.briefRelevance,
  }));
}

function uncertaintiesFromAi(
  sourceId: string,
  result: SourceUnderstanding,
): ResearchUncertainty[] {
  const requiredIndexes = new Set(result.uncertainties
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.riskLevel === 'high' && item.reviewPriority === 'required')
    .sort((left, right) => right.item.briefRelevance - left.item.briefRelevance)
    .slice(0, 2)
    .map(({ index }) => index));
  return result.uncertainties.map((uncertainty, index) => ({
    id: `${sourceId}-uncertainty-${String(index + 1).padStart(2, '0')}`,
    statement: uncertainty.statement,
    sourceReferences: uncertainty.sourceReferences.map(referenceFromAi),
    resolution: '',
    riskLevel: uncertainty.riskLevel,
    reviewPriority: uncertainty.reviewPriority === 'required' && !requiredIndexes.has(index)
      ? 'supporting'
      : uncertainty.reviewPriority,
    briefRelevance: uncertainty.briefRelevance,
  }));
}

function validateSourceUnderstanding(
  source: ShortVideoSource,
  result: SourceUnderstanding,
  options: { duration?: number; lineCount?: number } = {},
) {
  const entries = [
    ...result.facts.map((item, index) => ({ entryKind: `fact ${index + 1}`, ...item })),
    ...result.uncertainties.map((item, index) => ({ entryKind: `uncertainty ${index + 1}`, ...item })),
  ];
  for (const entry of entries) {
    if (!entry.statement.trim()) throw new Error(`AI source analysis returned an empty ${entry.entryKind}.`);
    if (!entry.sourceReferences.length) {
      throw new Error(`AI source analysis ${entry.entryKind} has no source reference.`);
    }
    for (const reference of entry.sourceReferences) {
      if (reference.sourceId !== source.id) {
        throw new Error(`AI source analysis ${entry.entryKind} references unknown sourceId ${reference.sourceId}.`);
      }
      if (reference.locatorType === 'time') {
        if (source.sourceType !== 'video' && source.sourceType !== 'audio') {
          throw new Error(`AI source analysis ${entry.entryKind} used a time reference for ${source.sourceType}.`);
        }
        if (reference.start == null || reference.end == null || reference.start < 0 || reference.end < reference.start) {
          throw new Error(`AI source analysis ${entry.entryKind} returned an invalid time range.`);
        }
        if (options.duration && reference.end > options.duration + 0.25) {
          throw new Error(`AI source analysis ${entry.entryKind} time range exceeds the source duration.`);
        }
      }
      if (reference.locatorType === 'line') {
        if (source.sourceType !== 'markdown' && source.sourceType !== 'text') {
          throw new Error(`AI source analysis ${entry.entryKind} used a line reference for ${source.sourceType}.`);
        }
        if (
          reference.lineStart == null ||
          reference.lineEnd == null ||
          reference.lineStart < 1 ||
          reference.lineEnd < reference.lineStart ||
          (options.lineCount != null && reference.lineEnd > options.lineCount)
        ) {
          throw new Error(`AI source analysis ${entry.entryKind} returned an invalid line range.`);
        }
      }
      if (reference.locatorType === 'image' && source.sourceType !== 'image' && source.sourceType !== 'video') {
        throw new Error(`AI source analysis ${entry.entryKind} used an image reference for ${source.sourceType}.`);
      }
    }
  }
}

function sourceProcessingMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '资料处理失败';
  if (message.startsWith('AI source analysis')) {
    return 'AI 返回的资料理解缺少有效来源定位，结果未写入项目。请重试处理；原始素材和本地抽取内容仍然保留。';
  }
  if (message.includes('429') || message.includes('限额')) {
    return 'AI 服务额度暂时不可用。原始素材和本地抽取内容已经保留；请稍后重试。';
  }
  if (message.startsWith('OpenAI') || message.includes('OPENAI_API_KEY')) return message;
  return message;
}

function callRecord(options: {
  project: ShortVideoProject;
  status: AiCallRecord['status'];
  model: string;
  inputHash: string;
  startedAt: string;
  error?: string;
  cacheHit?: boolean;
}): AiCallRecord {
  return {
    id: `ai-call-${String(options.project.ai.calls.length + 1).padStart(3, '0')}`,
    purpose: 'source-analysis',
    status: options.status,
    model: options.model,
    promptVersion: options.project.ai.promptVersion,
    inputHash: options.inputHash,
    startedAt: options.startedAt,
    completedAt: new Date().toISOString(),
    error: options.error ?? '',
    cacheHit: options.cacheHit === true,
  };
}

function extractAudioChunks(projectId: string, sourceId: string, inputPath: string, hash: string) {
  const ffmpegBinary = resolveFfmpegBinary();
  const workDir = resolve('output/source-processing', projectId, sourceId, hash);
  mkdirSync(workDir, { recursive: true });
  const chunkPattern = resolve(workDir, 'audio-%03d.wav');
  const existing = readdirSync(workDir)
    .filter((name) => /^audio-\d{3}\.wav$/.test(name))
    .sort()
    .map((name) => resolve(workDir, name));
  if (existing.length) return existing;
  const result = spawnSync(
    ffmpegBinary,
    [
      '-y', '-i', inputPath, '-vn', '-ac', '1', '-ar', '16000',
      '-f', 'segment', '-segment_time', '30', '-reset_timestamps', '1', chunkPattern,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`音频抽取失败：${spawnFailureDetails(result)}`);
  }
  const chunks = readdirSync(workDir)
    .filter((name) => /^audio-\d{3}\.wav$/.test(name))
    .sort()
    .map((name) => resolve(workDir, name));
  if (!chunks.length) throw new Error('音频抽取失败：FFmpeg 成功退出但没有生成音频分片。');
  return chunks;
}

function extractRepresentativeFrames(
  projectId: string,
  sourceId: string,
  inputPath: string,
  hash: string,
  duration: number,
): RepresentativeFrame[] {
  const ffmpegBinary = resolveFfmpegBinary();
  const workDir = resolve('output/source-processing', projectId, sourceId, hash);
  mkdirSync(workDir, { recursive: true });
  const ratios = duration > 0.2 ? [0.2, 0.5, 0.8] : [0.5];
  return ratios.map((ratio) => {
    const label = String(Math.round(ratio * 100)).padStart(2, '0');
    const framePath = resolve(workDir, `representative-frame-${label}pct.png`);
    const second = duration > 0
      ? Math.max(0, Math.min(duration * ratio, duration - 0.05))
      : 0;
    if (!existsSync(framePath) || statSync(framePath).size === 0) {
      const result = spawnSync(
        ffmpegBinary,
        ['-y', '-ss', second.toFixed(3), '-i', inputPath, '-frames:v', '1', framePath],
        { encoding: 'utf8' },
      );
      if (result.status !== 0 || !existsSync(framePath) || statSync(framePath).size === 0) {
        throw new Error(`代表帧抽取失败（${second.toFixed(2)}s）：${spawnFailureDetails(result)}`);
      }
    }
    return { path: framePath, second, ratio };
  });
}

async function processText(
  source: ShortVideoSource,
  path: string,
  brief: ShortVideoProject['brief'],
) {
  const text = readFileSync(path, 'utf8');
  const numberedText = text.split(/\r?\n/).map((line, index) => `${index + 1}: ${line}`).join('\n');
  const ai = await analyzeTextSource(source, numberedText, brief);
  validateSourceUnderstanding(source, ai.data, { lineCount: text.split(/\r?\n/).length });
  return {
    ai,
    analysis: {
      extractedText: text,
      visualDescription: '',
      transcript: [] as TranscriptSegment[],
      facts: factsFromAi(source.id, ai.data),
      uncertainties: uncertaintiesFromAi(source.id, ai.data),
    },
  };
}

async function processImage(
  source: ShortVideoSource,
  path: string,
  brief: ShortVideoProject['brief'],
) {
  const media = probeMedia(path);
  const localDescription = `本地图片 ${media.width || '?'}x${media.height || '?'}，文件 ${basename(path)}。`;
  const ai = await analyzeImageSource(source, readFileSync(path, 'base64'), brief);
  validateSourceUnderstanding(source, ai.data);
  return {
    ai,
    analysis: {
      extractedText: ai.data.extractedText,
      visualDescription: ai.data.visualDescription || localDescription,
      transcript: [] as TranscriptSegment[],
      facts: factsFromAi(source.id, ai.data),
      uncertainties: uncertaintiesFromAi(source.id, ai.data),
    },
    localDescription,
  };
}

async function processAudioOrVideo(
  projectId: string,
  source: ShortVideoSource,
  path: string,
  hash: string,
  media: MediaProbe,
  frames: RepresentativeFrame[],
  prompt: string,
  brief: ShortVideoProject['brief'],
) {
  if (source.sourceType === 'video' && !media.hasAudio) {
    const ai = await analyzeVideoSource(
      source,
      '',
      frames.map((frame) => ({ second: frame.second, imageBase64: readFileSync(frame.path, 'base64') })),
      brief,
    );
    validateSourceUnderstanding(source, ai.data, { duration: media.duration });
    return {
      ai,
      transcriptMetadata: [],
      analysis: {
        extractedText: ai.data.extractedText,
        visualDescription: `${ai.data.visualDescription || `本地视频 ${media.width || '?'}x${media.height || '?'}，时长 ${media.duration.toFixed(2)} 秒`}；本地理解覆盖 ${frames.map((frame) => `${frame.second.toFixed(2)}s`).join('、')} 代表帧。`,
        transcript: [] as TranscriptSegment[],
        facts: factsFromAi(source.id, ai.data),
        uncertainties: [
          ...uncertaintiesFromAi(source.id, ai.data),
          {
            id: `${source.id}-uncertainty-no-audio`,
            statement: '该视频未检测到可转录音轨，资料理解仅覆盖代表帧，未覆盖完整动态画面。',
            sourceReferences: [{ sourceId: source.id, locatorType: 'file' as const, note: '本地媒体流探测' }],
            resolution: '',
            riskLevel: 'low' as const,
            reviewPriority: 'reference' as const,
            briefRelevance: 10,
          },
          {
            id: `${source.id}-uncertainty-frame-sampling`,
            statement: '视频画面理解基于 20%、50% 和 80% 代表帧，未逐帧覆盖完整动态过程。',
            sourceReferences: frames.map((frame) => ({
              sourceId: source.id,
              locatorType: 'time' as const,
              start: frame.second,
              end: frame.second,
              note: `${Math.round(frame.ratio * 100)}% 本地代表帧`,
            })),
            resolution: '',
            riskLevel: 'low' as const,
            reviewPriority: 'reference' as const,
            briefRelevance: 10,
          },
        ],
      },
    };
  }
  if (!media.hasAudio) throw new Error('音频素材未检测到可转录音轨。');
  const chunks = extractAudioChunks(projectId, source.id, path, hash);
  const transcript: TranscriptSegment[] = [];
  const transcriptMetadata: Array<{ model: string; cacheHit: boolean }> = [];
  const frameSamplingUncertainty: ResearchUncertainty[] = source.sourceType === 'video'
    ? [{
        id: `${source.id}-uncertainty-frame-sampling`,
        statement: '视频画面理解基于 20%、50% 和 80% 代表帧，未逐帧覆盖完整动态过程。',
        sourceReferences: frames.map((frame) => ({
          sourceId: source.id,
          locatorType: 'time',
          start: frame.second,
          end: frame.second,
          note: `${Math.round(frame.ratio * 100)}% 本地代表帧`,
        })),
        resolution: '',
        riskLevel: 'low',
        reviewPriority: 'reference',
        briefRelevance: 10,
      }]
    : [];
  try {
    for (let index = 0; index < chunks.length; index += 1) {
      const chunkHash = createHash('sha256').update(`${hash}:${index}`).digest('hex');
      const result = transcribeAudioLocally(chunks[index], chunkHash, prompt);
      transcriptMetadata.push({ model: result.model, cacheHit: result.cacheHit });
      const chunkStart = index * 30;
      const segments = result.segments.length
        ? result.segments
        : [{ start: 0, end: 30, text: result.text }];
      segments.forEach((segment) => {
        transcript.push({
          id: `${source.id}-segment-${String(transcript.length + 1).padStart(3, '0')}`,
          sourceId: source.id,
          start: chunkStart + segment.start,
          end: Math.min(media.duration || chunkStart + segment.end, chunkStart + segment.end),
          text: segment.text,
        });
      });
    }
  } catch (error) {
    if (source.sourceType !== 'video') throw error;
    const ai = await analyzeVideoSource(
      source,
      '',
      frames.map((frame) => ({ second: frame.second, imageBase64: readFileSync(frame.path, 'base64') })),
      brief,
    );
    validateSourceUnderstanding(source, ai.data, { duration: media.duration });
    return {
      ai,
      transcriptMetadata,
      analysis: {
        extractedText: ai.data.extractedText,
        visualDescription: `${ai.data.visualDescription || `本地视频 ${media.width || '?'}x${media.height || '?'}，时长 ${media.duration.toFixed(2)} 秒`}；本地理解覆盖 ${frames.map((frame) => `${frame.second.toFixed(2)}s`).join('、')} 代表帧。`,
        transcript: [] as TranscriptSegment[],
        facts: factsFromAi(source.id, ai.data),
        uncertainties: [
          ...uncertaintiesFromAi(source.id, ai.data),
          {
            id: `${source.id}-uncertainty-transcription-failed`,
            statement: '本地语音转录失败，当前资料理解只覆盖视频代表帧，未包含音轨语义。',
            sourceReferences: [{ sourceId: source.id, locatorType: 'file' as const, note: '本地 Whisper 转录失败' }],
            resolution: error instanceof Error ? error.message : '请重试或人工补充转录。',
            riskLevel: 'high' as const,
            reviewPriority: 'required' as const,
            briefRelevance: 90,
          },
          ...frameSamplingUncertainty,
        ],
      },
    };
  }
  const transcriptText = transcript
    .map((segment) => `[${segment.start.toFixed(2)}-${segment.end.toFixed(2)}] ${segment.text}`)
    .join('\n');
  const ai = source.sourceType === 'video'
    ? await analyzeVideoSource(
        source,
      transcriptText,
      frames.map((frame) => ({ second: frame.second, imageBase64: readFileSync(frame.path, 'base64') })),
      brief,
    )
    : await analyzeTextSource(source, transcriptText, brief);
  validateSourceUnderstanding(source, ai.data, { duration: media.duration });
  return {
    ai,
    transcriptMetadata,
    analysis: {
      extractedText: [transcriptText, ai.data.extractedText].filter(Boolean).join('\n\n'),
      visualDescription: source.sourceType === 'video'
        ? `${ai.data.visualDescription || `本地视频 ${media.width || '?'}x${media.height || '?'}，时长 ${media.duration.toFixed(2)} 秒`}；本地理解覆盖 ${frames.map((frame) => `${frame.second.toFixed(2)}s`).join('、')} 代表帧。`
        : '',
      transcript,
      facts: factsFromAi(source.id, ai.data),
      uncertainties: [...uncertaintiesFromAi(source.id, ai.data), ...frameSamplingUncertainty],
    },
  };
}

export async function processProjectSource(projectId: string, sourceId: string) {
  const initialProject = readBrief(projectId);
  const initialSource = initialProject.sources.find((source) => source.id === sourceId);
  if (!initialSource) throw new Error(`Source not found: ${sourceId}`);
  const path = resolveSourceAssetPath(initialSource.assetPath);
  if (!existsSync(path) || statSync(path).size === 0) throw new Error(`素材文件不存在或为空：${initialSource.assetPath}`);
  const hash = fileHash(path);
  const startedAt = new Date().toISOString();
  const reusedSource = completedReusedSource(initialSource, hash);
  if (reusedSource) {
    const completedAt = new Date().toISOString();
    return updateCanonicalProject(projectId, (project) => {
      const updated = updateSource(project, sourceId, (source) => ({
        ...source,
        analysis: remapReusedAnalysis(sourceId, reusedSource.analysis),
        processing: {
          ...source.processing,
          status: 'completed',
          stage: 'completed',
          attempts: source.processing.attempts + 1,
          inputHash: hash,
          startedAt,
          completedAt,
          error: '',
          model: reusedSource.processing.model,
          promptVersion: reusedSource.processing.promptVersion,
          cacheHit: true,
        },
      }));
      const record = callRecord({
        project: updated,
        status: 'completed',
        model: reusedSource.processing.model || 'reused-local-analysis',
        inputHash: hash,
        startedAt,
        cacheHit: true,
      });
      return rebuildResearch({
        ...updated,
        ai: { ...updated.ai, calls: [...updated.ai.calls, record] },
      });
    });
  }
  updateCanonicalProject(projectId, (project) => updateSource(project, sourceId, (source) => ({
    ...source,
    processing: {
      ...source.processing,
      status: 'running',
      stage: 'local-extraction',
      attempts: source.processing.attempts + 1,
      inputHash: hash,
      startedAt,
      completedAt: '',
      error: '',
      cacheHit: false,
    },
  })));

  let localAnalysis = initialSource.analysis;
  try {
    let result;
    if (initialSource.sourceType === 'markdown' || initialSource.sourceType === 'text') {
      const text = readFileSync(path, 'utf8');
      localAnalysis = { ...localAnalysis, extractedText: text };
      updateCanonicalProject(projectId, (project) => updateSource(project, sourceId, (source) => ({
        ...source,
        analysis: localAnalysis,
        processing: { ...source.processing, stage: 'fact-extraction' },
      })));
      result = await processText(initialSource, path, initialProject.brief);
    } else if (initialSource.sourceType === 'image') {
      const media = probeMedia(path);
      localAnalysis = {
        ...localAnalysis,
        visualDescription: `本地图片 ${media.width || '?'}x${media.height || '?'}，等待 AI 视觉理解。`,
      };
      updateCanonicalProject(projectId, (project) => updateSource(project, sourceId, (source) => ({
        ...source,
        analysis: localAnalysis,
        processing: { ...source.processing, stage: 'vision' },
      })));
      result = await processImage(initialSource, path, initialProject.brief);
    } else if (initialSource.sourceType === 'audio' || initialSource.sourceType === 'video') {
      const media = probeMedia(path);
      const frames = initialSource.sourceType === 'video'
        ? extractRepresentativeFrames(projectId, initialSource.id, path, hash, media.duration)
        : [];
      const noAudioUncertainty: ResearchUncertainty[] = initialSource.sourceType === 'video' && !media.hasAudio
        ? [{
            id: `${initialSource.id}-uncertainty-no-audio`,
            statement: '该视频未检测到可转录音轨，资料理解仅覆盖 20%、50% 和 80% 代表帧，未覆盖完整动态画面。',
            sourceReferences: [{ sourceId: initialSource.id, locatorType: 'file', note: '本地媒体流探测' }],
            resolution: '',
            riskLevel: 'low',
            reviewPriority: 'reference',
            briefRelevance: 10,
          }]
        : [];
      const frameSamplingUncertainty: ResearchUncertainty[] = initialSource.sourceType === 'video'
        ? [{
            id: `${initialSource.id}-uncertainty-frame-sampling`,
            statement: `视频画面理解基于 ${frames.length} 张代表帧，未逐帧覆盖完整动态过程。`,
            sourceReferences: frames.map((frame) => ({
              sourceId: initialSource.id,
              locatorType: 'time',
              start: frame.second,
              end: frame.second,
              note: `${Math.round(frame.ratio * 100)}% 本地代表帧`,
            })),
            resolution: '',
            riskLevel: 'low',
            reviewPriority: 'reference',
            briefRelevance: 10,
          }]
        : [];
      localAnalysis = {
        ...localAnalysis,
        visualDescription: initialSource.sourceType === 'video'
          ? `本地视频 ${media.width || '?'}x${media.height || '?'}，时长 ${media.duration.toFixed(2)} 秒；已抽取 ${frames.length} 张代表帧，${media.hasAudio ? '等待转录和联合语义理解。' : '无音轨，等待代表帧视觉理解。'}`
          : '',
        uncertainties: [...noAudioUncertainty, ...frameSamplingUncertainty],
      };
      updateCanonicalProject(projectId, (project) => updateSource(project, sourceId, (source) => ({
        ...source,
        analysis: localAnalysis,
        processing: {
          ...source.processing,
          stage: initialSource.sourceType === 'video' && !media.hasAudio ? 'vision' : 'transcription',
        },
      })));
      result = await processAudioOrVideo(
        projectId,
        initialSource,
        path,
        hash,
        media,
        frames,
        transcriptionPrompt(initialProject, initialSource),
        initialProject.brief,
      );
    } else {
      throw new Error(`当前不支持处理 sourceType=${initialSource.sourceType}`);
    }

    const completedAt = new Date().toISOString();
    return updateCanonicalProject(projectId, (project) => {
      const updated = updateSource(project, sourceId, (source) => ({
        ...source,
        analysis: result.analysis,
        processing: {
          ...source.processing,
          status: 'completed',
          stage: 'completed',
          inputHash: hash,
          completedAt,
          error: '',
          model: result.ai.model,
          promptVersion: result.ai.promptVersion,
          cacheHit: result.ai.cacheHit,
        },
      }));
      const record = callRecord({
        project: updated,
        status: 'completed',
        model: result.ai.model,
        inputHash: result.ai.inputHash,
        startedAt,
        cacheHit: result.ai.cacheHit,
      });
      const transcriptMetadata = 'transcriptMetadata' in result
        ? result.transcriptMetadata as Array<{ model: string; cacheHit: boolean }>
        : [];
      const transcriptionModel = transcriptMetadata.at(-1)?.model;
      return rebuildResearch({
        ...updated,
        ai: {
          ...updated.ai,
          model: result.ai.model,
          transcriptionModel: transcriptionModel ?? updated.ai.transcriptionModel,
          calls: [...updated.ai.calls, record],
        },
      });
    });
  } catch (error) {
    const message = sourceProcessingMessage(error);
    const config = readAiConfig();
    const transcriptionConfig = readLocalTranscriptionConfig();
    updateCanonicalProject(projectId, (project) => {
      const updated = updateSource(project, sourceId, (source) => ({
        ...source,
        analysis: localAnalysis,
        processing: {
          ...source.processing,
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: message,
          model: source.processing.stage === 'transcription' ? transcriptionConfig.model : config.model,
          promptVersion: config.promptVersion,
          cacheHit: false,
        },
      }));
      const record = callRecord({
        project: updated,
        status: 'failed',
        model: updated.sources.find((source) => source.id === sourceId)?.processing.model || config.model,
        inputHash: hash,
        startedAt,
        error: message,
      });
      return rebuildResearch({ ...updated, ai: { ...updated.ai, calls: [...updated.ai.calls, record] } });
    });
    throw new Error(message);
  }
}
