import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import OpenAI from 'openai';
import type { ResponseInput } from 'openai/resources/responses/responses';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { readAiConfig } from './aiConfig';
import {
  CandidateRankingSchema,
  NarrativePlanSchema,
  ProductionAssetsSchema,
  SourceUnderstandingSchema,
} from './aiSchemas';
import type { ShortVideoProject, ShortVideoSource } from './shortVideoBrief';
import { confirmedNarrativeFacts, keyResearchFacts } from './researchReview';

const cacheRoot = resolve('output/ai-cache');

export class MissingOpenAIKeyError extends Error {
  constructor() {
    super('OPENAI_API_KEY 未配置；未执行 OpenAI API 调用。');
    this.name = 'MissingOpenAIKeyError';
  }
}

interface StructuredCallResult<T> {
  data: T;
  model: string;
  promptVersion: string;
  inputHash: string;
  cacheHit: boolean;
}

function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function client() {
  const config = readAiConfig();
  if (!config.apiKeyAvailable) throw new MissingOpenAIKeyError();
  return {
    client: new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      defaultHeaders: { 'User-Agent': 'VideoBrief/1.0' },
    }),
    config,
  };
}

async function structuredCall<T>(options: {
  schema: z.ZodType<T>;
  schemaName: string;
  purpose: string;
  input: string | ResponseInput;
  validate?: (data: T) => void;
}): Promise<StructuredCallResult<T>> {
  const config = readAiConfig();
  const inputHash = stableHash({
    endpoint: config.baseUrl || 'openai-default',
    model: config.model,
    promptVersion: config.promptVersion,
    purpose: options.purpose,
    input: options.input,
  });
  const cachePath = resolve(cacheRoot, `${inputHash}.json`);
  if (existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, 'utf8')) as { data?: unknown };
    const parsed = options.schema.safeParse(cached.data);
    if (parsed.success) {
      try {
        options.validate?.(parsed.data);
        return {
          data: parsed.data,
          model: config.model,
          promptVersion: config.promptVersion,
          inputHash,
          cacheHit: true,
        };
      } catch {
        rmSync(cachePath, { force: true });
      }
    }
  }

  const openai = client();
  const response = await openai.client.responses.parse({
    model: openai.config.model,
    input: options.input,
    store: false,
    reasoning: { effort: 'low' },
    text: { format: zodTextFormat(options.schema, options.schemaName) },
  });
  if (!response.output_parsed) throw new Error('OpenAI 返回了空的结构化结果或拒绝了请求。');
  const data = options.schema.parse(response.output_parsed);
  options.validate?.(data);
  mkdirSync(cacheRoot, { recursive: true });
  writeFileSync(
    cachePath,
    `${JSON.stringify({
      schemaVersion: 1,
      model: openai.config.model,
      promptVersion: openai.config.promptVersion,
      createdAt: new Date().toISOString(),
      data,
    }, null, 2)}\n`,
  );
  return {
    data,
    model: openai.config.model,
    promptVersion: openai.config.promptVersion,
    inputHash,
    cacheHit: false,
  };
}

function sourcePrompt(
  source: ShortVideoSource,
  extractedText: string,
  brief: ShortVideoProject['brief'],
) {
  return [
    '你在为个人视频生产项目整理可追溯资料。只基于给定来源提取，不补充外部事实。',
    '返回事实时必须引用 sourceId 和准确的行号、时间范围或图片位置。',
    '每一条 fact 和 uncertainty 的 sourceReferences 都必须至少包含一个引用，禁止返回空数组。',
    'Markdown/文本使用 line 定位；音视频使用 time；图片使用 image；无法精确定位时使用 file 并说明原因。',
    '无法由来源证明的内容写入 uncertainties，不要把推断写成事实。',
    '区分内容主张与视觉元数据：会影响脚本结论的可证明陈述标为 claim；颜色、布局、按钮、导航和单纯可见文字标为 visual_metadata。',
    'reviewPriority=required 只用于与 Creative Brief 直接相关、进入脚本前必须人工确认的关键主张；每份来源最多 3 条。',
    'supporting 用于可能有帮助但不阻塞脚本的内容；reference 用于视觉描述、界面元素和其他仅供追溯的信息。',
    'uncertainty 只有在会改变脚本准确性或核心结论时才标为 high + required；每份来源最多 2 条。',
    'briefRelevance 使用 0-100 表示与本项目目标和核心信息的相关程度，不表示事实真实性。',
    `sourceId: ${source.id}`,
    `sourceType: ${source.sourceType}`,
    `sourceLabel: ${source.label}`,
    `Creative Brief: ${JSON.stringify(brief)}`,
    '来源内容：',
    extractedText.slice(0, 50000),
    extractedText.length > 50000 ? '\n[内容在 50000 字符后被截断，必须在 uncertainties 中说明覆盖限制。]' : '',
  ].join('\n');
}

export function analyzeTextSource(
  source: ShortVideoSource,
  extractedText: string,
  brief: ShortVideoProject['brief'],
) {
  return structuredCall({
    schema: SourceUnderstandingSchema,
    schemaName: 'videobrief_source_understanding',
    purpose: `source-analysis:${source.id}`,
    input: sourcePrompt(source, extractedText, brief),
  });
}

export function analyzeImageSource(
  source: ShortVideoSource,
  imageBase64: string,
  brief: ShortVideoProject['brief'],
) {
  const input: ResponseInput = [{
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: sourcePrompt(source, '图片输入。请提取可见文字、界面状态和可核验视觉事实。', brief),
      },
      {
        type: 'input_image',
        image_url: `data:${source.mimeType || 'image/png'};base64,${imageBase64}`,
        detail: 'high',
      },
    ],
  }];
  return structuredCall({
    schema: SourceUnderstandingSchema,
    schemaName: 'videobrief_image_understanding',
    purpose: `source-analysis:${source.id}`,
    input,
  });
}

export function analyzeVideoSource(
  source: ShortVideoSource,
  transcriptText: string,
  frames: Array<{ second: number; imageBase64: string }>,
  brief: ShortVideoProject['brief'],
) {
  const input: ResponseInput = [{
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: sourcePrompt(source, [
          '下面是本地转录和代表帧。只引用提供的时间范围，不得声称覆盖了未抽帧的完整动态画面。',
          '本地转录：',
          transcriptText || '[未检测到可转录音轨]',
          '代表帧时间点：',
          frames.map((frame) => `${frame.second.toFixed(2)}s`).join(', '),
        ].join('\n'), brief),
      },
      ...frames.flatMap((frame) => ([
        {
          type: 'input_text' as const,
          text: `视频 ${frame.second.toFixed(2)} 秒代表帧：`,
        },
        {
          type: 'input_image' as const,
          image_url: `data:image/png;base64,${frame.imageBase64}`,
          detail: 'high' as const,
        },
      ])),
    ],
  }];
  return structuredCall({
    schema: SourceUnderstandingSchema,
    schemaName: 'videobrief_video_understanding',
    purpose: `source-analysis:${source.id}`,
    input,
  });
}

function projectEvidence(project: ShortVideoProject, allowUnconfirmedFacts = false) {
  return {
    brief: project.brief,
    facts: allowUnconfirmedFacts
      ? keyResearchFacts(project).filter((fact) => fact.reviewStatus !== 'rejected')
      : confirmedNarrativeFacts(project),
    uncertainties: project.research.uncertainties,
    sources: project.sources.filter((source) => source.processing.status === 'completed').map((source) => ({
      id: source.id,
      label: source.label,
      sourceType: source.sourceType,
      rightsStatus: source.rightsStatus,
      verificationStatus: source.verificationStatus,
      processingStatus: source.processing.status,
      analysis: {
        extractedText: source.analysis.extractedText.slice(0, 12000),
        visualDescription: source.analysis.visualDescription,
        transcript: source.analysis.transcript,
      },
    })),
  };
}

export function planNarrative(
  project: ShortVideoProject,
  validate?: (data: z.infer<typeof NarrativePlanSchema>) => void,
  options: { instruction?: string; allowUnconfirmedFacts?: boolean } = {},
) {
  const evidence = projectEvidence(project, options.allowUnconfirmedFacts === true);
  const allowedSourceIds = evidence.sources.map((source) => source.id);
  return structuredCall({
    schema: NarrativePlanSchema,
    schemaName: 'videobrief_narrative_plan',
    purpose: `narrative-planning:${project.id}`,
    input: [
      '根据 Creative Brief 和来源证据生成原创视频叙事与场景草案。',
      '不得逐段翻译或复述单一来源；不得新增来源中不存在的事实。',
      options.allowUnconfirmedFacts
        ? '这是自动制作草案。facts 可能尚未人工确认；必须保留审慎措辞和 uncertainties，不得把 AI 提取结果表述为人工背书。'
        : '只有 facts 数组中的 confirmed facts 可以作为正式事实主张；原始正文和转录只用于理解上下文。',
      '每个场景都要给出 sourceReferences、画面需求和独立旁白。',
      '总叙事和每一个场景的 sourceReferences 数组都必须至少包含一个有效来源引用，禁止返回空数组。',
      '保留不确定项并明确需要人工确认的内容。',
      `sourceReferences.sourceId 只能逐字使用这些来源 ID：${allowedSourceIds.join(', ')}。`,
      'facts[].id 和 uncertainties[].id 不是 sourceId，禁止把 fact ID 或 uncertainty ID 填入 sourceId。',
      'Markdown/文本使用 line 定位；图片使用 image；视频代表帧使用 image 或 time；未使用的定位数值返回 null。',
      options.instruction?.trim() ? `用户对当前成片的修改要求：${options.instruction.trim()}` : '',
      options.instruction?.trim() ? `当前已应用版本与场景：${JSON.stringify({ narrative: project.narrative.versions.find((version) => version.id === project.narrative.activeVersionId), scenes: project.scenes })}` : '',
      JSON.stringify(evidence),
    ].filter(Boolean).join('\n'),
    validate,
  });
}

export function rankCandidates(
  project: ShortVideoProject,
  validate?: (data: z.infer<typeof CandidateRankingSchema>) => void,
) {
  const visualSources = project.sources.filter(
    (source) => source.sourceType === 'video' || source.sourceType === 'image',
  );
  return structuredCall({
    schema: CandidateRankingSchema,
    schemaName: 'videobrief_candidate_ranking',
    purpose: `candidate-ranking:${project.id}`,
    input: [
      '为每个场景从给定的自有或已登记素材中选择一个候选画面。',
      '只允许返回输入中存在的 sourceId；必须说明匹配理由。',
      `sourceId 只能逐字使用：${visualSources.map((source) => source.id).join(', ')}。`,
      '视频给出合理时间范围，图片时间范围使用 0 到场景建议时长。',
      JSON.stringify({
        scenes: project.scenes.map((scene, sceneIndex) => ({ sceneIndex, title: scene.title, visualRequirement: scene.visualRequirement, sourceReferences: scene.sourceReferences })),
        sources: visualSources.map((source) => ({
          id: source.id,
          type: source.sourceType,
          rightsStatus: source.rightsStatus,
          analysis: {
            ...source.analysis,
            facts: source.analysis.facts.filter((fact) => fact.reviewStatus !== 'rejected'),
          },
        })),
      }),
    ].join('\n'),
    validate,
  });
}

export function generateProductionAssets(project: ShortVideoProject) {
  return structuredCall({
    schema: ProductionAssetsSchema,
    schemaName: 'videobrief_production_assets',
    purpose: `production-assets:${project.id}`,
    input: [
      '根据已确认的视频项目生成克制、准确的平台标题、简介、标签和封面标题。',
      '不得把未确认事实写入标题，不得声称已发布或已验证市场。',
      JSON.stringify({
        brief: project.brief,
        narrative: project.narrative,
        scenes: project.scenes,
        facts: confirmedNarrativeFacts(project),
      }),
    ].join('\n'),
  });
}
