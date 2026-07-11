import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import {
  DEFAULT_BRIEF_PATH,
  ProductionTimeline,
  ShortVideoProject,
  ShortVideoProjectScene,
  ShortVideoRenderManifest,
  ShortVideoSource,
  WorkbenchRenderStatus,
} from './shortVideoBrief';

export const briefPath = resolve(DEFAULT_BRIEF_PATH);
const defaultWorkDir = resolve('output/videos/local-ffmpeg-synced-work');
export const timelinePath = resolve(defaultWorkDir, 'timeline.json');
export const srtPath = resolve(defaultWorkDir, 'weekly-ai-short-synced.srt');
export const assPath = resolve(defaultWorkDir, 'weekly-ai-short-synced.ass');
export const voiceoverPath = resolve(defaultWorkDir, 'voiceover-synced.aiff');
export const stableTsPath = resolve('output/videos/stable-ts-align/voiceover-stable-ts.srt');

type LegacyProjectInput = Partial<ShortVideoProject> & {
  sourceVideo?: string;
  outputVideo?: string;
  publicRender?: string;
  workDir?: string;
};

function numberValue(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function normalizeSource(source: Partial<ShortVideoSource>, index: number): ShortVideoSource {
  const sourceType = [
    'official',
    'github',
    'paper',
    'demo',
    'social',
    'video',
    'news',
  ].includes(source.sourceType ?? '')
    ? source.sourceType!
    : 'video';
  const verificationStatus = ['verified', 'needs_check', 'weak'].includes(
    source.verificationStatus ?? '',
  )
    ? source.verificationStatus!
    : 'needs_check';
  const rightsStatus = ['cleared', 'review_required', 'blocked'].includes(
    source.rightsStatus ?? '',
  )
    ? source.rightsStatus!
    : 'review_required';

  return {
    id: textValue(source.id) || `source-${String(index + 1).padStart(2, '0')}`,
    label: textValue(source.label) || `来源 ${index + 1}`,
    sourceType,
    originUrl: textValue(source.originUrl),
    assetPath: textValue(source.assetPath),
    publishedAt: textValue(source.publishedAt),
    verificationStatus,
    rightsStatus,
    rightsNote: textValue(source.rightsNote),
  };
}

function normalizeScene(
  scene: Partial<ShortVideoProjectScene>,
  index: number,
  defaultSourceId: string,
): ShortVideoProjectScene {
  const sourceStart = Math.max(0, numberValue(scene.sourceStart, 0));
  const sourceEnd = Math.max(sourceStart + 0.5, numberValue(scene.sourceEnd, sourceStart + 3));

  return {
    id: textValue(scene.id) || `scene-${String(index + 1).padStart(2, '0')}`,
    enabled: scene.enabled !== false,
    sourceId: textValue(scene.sourceId) || defaultSourceId,
    sourceStart,
    sourceEnd,
    eyebrow: textValue(scene.eyebrow),
    title: textValue(scene.title),
    subtitle: textValue(scene.subtitle),
  };
}

export function normalizeBrief(input: LegacyProjectInput): ShortVideoProject {
  const legacySourcePath = textValue(input.sourceVideo);
  const rawSources = Array.isArray(input.sources) ? input.sources : [];
  const sources = (
    rawSources.length
      ? rawSources
      : [
          {
            id: 'openai-codex-official',
            label: 'OpenAI Codex 官方原片',
            sourceType: 'official' as const,
            assetPath:
              legacySourcePath || 'public/source-clips/openai-codex-app-vertical-30fps.mp4',
          },
        ]
  ).map(normalizeSource);
  const defaultSourceId = sources[0]?.id ?? 'source-01';
  const scenes = Array.isArray(input.scenes) ? input.scenes : [];

  return {
    schemaVersion: 1,
    id: textValue(input.id) || 'codex-app-explainer',
    title: textValue(input.title) || 'OpenAI Codex app 中文短视频样片',
    format: 'single_signal',
    targetAudience:
      textValue(input.targetAudience) || '中文 AI 实践者 / 开发者 / 独立开发者',
    status:
      input.status === 'review' ||
      input.status === 'ready' ||
      input.status === 'published' ||
      input.status === 'draft'
        ? input.status
        : 'draft',
    sources,
    editorial: {
      claim: textValue(input.editorial?.claim),
      whyItMatters: textValue(input.editorial?.whyItMatters),
      chinaContext: textValue(input.editorial?.chinaContext),
      riskNote: textValue(input.editorial?.riskNote),
    },
    outputs: {
      outputVideo:
        textValue(input.outputs?.outputVideo) ||
        textValue(input.outputVideo) ||
        'output/videos/codex-app-explainer.mp4',
      publicRender:
        textValue(input.outputs?.publicRender) ||
        textValue(input.publicRender) ||
        'public/renders/codex-app-explainer.mp4',
      workDir:
        textValue(input.outputs?.workDir) ||
        textValue(input.workDir) ||
        'output/videos/codex-app-explainer-work',
    },
    render: {
      width: numberValue(input.render?.width, 1080),
      height: numberValue(input.render?.height, 1920),
      fps: numberValue(input.render?.fps, 30),
      voice: textValue(input.render?.voice) || 'Eddy (中文（中国大陆）)',
      rate: numberValue(input.render?.rate, 205),
    },
    scenes: scenes.map((scene, index) => normalizeScene(scene, index, defaultSourceId)),
  };
}

export function readBrief() {
  return normalizeBrief(JSON.parse(readFileSync(briefPath, 'utf8')) as LegacyProjectInput);
}

export function projectFingerprint() {
  return createHash('sha256').update(readFileSync(briefPath)).digest('hex');
}

export function writeBrief(project: ShortVideoProject) {
  const current = readBrief();
  const normalized = normalizeBrief(project);
  const normalizedSources = new Map(normalized.sources.map((source) => [source.id, source]));
  const next: ShortVideoProject = {
    ...normalized,
    outputs: current.outputs,
    render: current.render,
    sources: current.sources.map((source) => ({
      ...source,
      ...normalizedSources.get(source.id),
      id: source.id,
      assetPath: source.assetPath,
    })),
  };
  const temporaryPath = `${briefPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(temporaryPath, briefPath);
  return next;
}

export function publicHref(path: string) {
  if (!path.startsWith('public/')) return undefined;
  return `/${path.replace(/^public\//, '')}`;
}

export function projectPaths(project: ShortVideoProject) {
  const workDir = resolve(project.outputs.workDir);
  const sources = project.sources.map((source) => ({
    ...source,
    path: resolve(source.assetPath),
    href: publicHref(source.assetPath),
  }));
  const primarySource = sources[0];

  return {
    briefPath,
    sources,
    sourceVideoPath: primarySource?.path ?? '',
    sourceVideoHref: primarySource?.href ?? '',
    outputVideoPath: resolve(project.outputs.outputVideo),
    publicRenderPath: resolve(project.outputs.publicRender),
    publicRenderHref: publicHref(project.outputs.publicRender) ?? '',
    timelinePath: join(workDir, 'timeline.json'),
    manifestPath: join(workDir, 'render-manifest.json'),
    srtPath: join(workDir, 'weekly-ai-short-synced.srt'),
    assPath: join(workDir, 'weekly-ai-short-synced.ass'),
    voiceoverPath: join(workDir, 'voiceover-synced.aiff'),
    stableTsPath,
  };
}

export function readTimeline(path = timelinePath): ProductionTimeline {
  if (!existsSync(path)) return { duration: 0, scenes: [] };
  return JSON.parse(readFileSync(path, 'utf8')) as ProductionTimeline;
}

export function readRenderManifest(path: string): ShortVideoRenderManifest | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as ShortVideoRenderManifest;
}

export function renderStatus(
  manifest: ShortVideoRenderManifest | null,
): WorkbenchRenderStatus {
  if (!manifest) {
    return {
      state: 'missing',
      label: '尚未渲染',
      message: '保存分镜后运行生产渲染，才会生成可验收成片。',
    };
  }
  if (
    resolve(manifest.briefPath) !== briefPath ||
    manifest.projectFingerprint !== projectFingerprint()
  ) {
    return {
      state: 'stale',
      label: '成片已过期',
      message: '项目文件已修改，当前 MP4 不再对应最新分镜。',
      renderedAt: manifest.renderedAt,
      duration: manifest.render.duration,
    };
  }
  if (!manifest.proof?.passed) {
    return {
      state: 'unverified',
      label: '等待验收',
      message: '成片已生成，但尚未通过当前项目的画面、音轨和产物检查。',
      renderedAt: manifest.renderedAt,
      duration: manifest.render.duration,
    };
  }
  const artifactsExist = Object.values(manifest.artifacts).every(
    (path) => path == null || (existsSync(path) && statSync(path).size > 0),
  );
  if (!artifactsExist) {
    return {
      state: 'unverified',
      label: '成片产物缺失',
      message: 'manifest 中至少有一个 MP4、字幕、配音或时间轴产物不存在。',
      renderedAt: manifest.renderedAt,
      duration: manifest.render.duration,
    };
  }
  return {
    state: 'ready',
    label: '成片已验收',
    message: 'MP4、音轨、字幕、时间轴和抽帧均通过当前项目检查。',
    renderedAt: manifest.renderedAt,
    duration: manifest.render.duration,
  };
}

export function readText(path: string) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

export function fileSize(path: string) {
  if (!existsSync(path)) return 'missing';
  const bytes = statSync(path).size;
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
