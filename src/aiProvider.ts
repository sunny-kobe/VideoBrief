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
  LongFormChapterPlanSchema,
  LongFormOutlineSchema,
  NarrativePlanSchema,
  ProductionAssetsSchema,
  SourceHierarchySchema,
  SourceUnderstandingSchema,
} from './aiSchemas';
import type { LongFormOutline } from './aiSchemas';
import {
  buildLongFormEvidenceUnits,
  longFormEvidenceUnitsForPrompt,
  longFormChapterVisualSourceIds,
  longFormNarrationBudget,
  selectLongFormEvidenceUnits,
} from './longFormPlanning';
import type {
  ProjectChapter,
  ShortVideoProject,
  ShortVideoProjectScene,
  ShortVideoSource,
  SourceAnalysisChapter,
} from './shortVideoBrief';
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
      timeout: 90_000,
      maxRetries: 0,
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
  context: { purposeSuffix?: string; scope?: string } = {},
) {
  return structuredCall({
    schema: SourceUnderstandingSchema,
    schemaName: 'videobrief_source_understanding',
    purpose: `source-analysis:${source.id}${context.purposeSuffix ? `:${context.purposeSuffix}` : ''}`,
    input: sourcePrompt(source, [context.scope, extractedText].filter(Boolean).join('\n'), brief),
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
  context: { purposeSuffix?: string; scope?: string } = {},
) {
  const input: ResponseInput = [{
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: sourcePrompt(source, [
          '下面是本地转录和代表帧。只引用提供的时间范围，不得声称覆盖了未抽帧的完整动态画面。',
          context.scope || '',
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
    purpose: `source-analysis:${source.id}${context.purposeSuffix ? `:${context.purposeSuffix}` : ''}`,
    input,
  });
}

export function analyzeSourceHierarchy(
  source: ShortVideoSource,
  chapters: SourceAnalysisChapter[],
  brief: ShortVideoProject['brief'],
) {
  const chapterIds = new Set(chapters.map((chapter) => chapter.id));
  return structuredCall({
    schema: SourceHierarchySchema,
    schemaName: 'videobrief_source_hierarchy',
    purpose: `source-hierarchy:${source.id}`,
    input: [
      '只根据下面已经完成的章节摘要，生成整份素材的层级摘要和简洁章节标题。',
      '不得新增章节中不存在的事实，不得改变 chapterId，不得遗漏或增加章节。',
      `sourceId: ${source.id}`,
      `Creative Brief: ${JSON.stringify(brief)}`,
      JSON.stringify(chapters.map((chapter) => ({
        chapterId: chapter.id,
        start: chapter.start,
        end: chapter.end,
        summary: chapter.summary,
        facts: chapter.facts.map((fact) => fact.statement),
        uncertainties: chapter.uncertainties.map((item) => item.statement),
      }))),
    ].join('\n'),
    validate(data) {
      if (data.chapters.length !== chapters.length) {
        throw new Error('AI source hierarchy returned an incomplete chapter list.');
      }
      for (const chapter of data.chapters) {
        if (!chapterIds.has(chapter.chapterId)) {
          throw new Error(`AI source hierarchy referenced unknown chapterId ${chapter.chapterId}.`);
        }
      }
    },
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

export function planLongFormOutline(
  project: ShortVideoProject,
  validate?: (data: z.infer<typeof LongFormOutlineSchema>) => void,
  options: {
    instruction?: string;
    allowUnconfirmedFacts?: boolean;
    validationFeedback?: string;
  } = {},
) {
  const units = buildLongFormEvidenceUnits(project, options.allowUnconfirmedFacts === true);
  const promptUnits = longFormEvidenceUnitsForPrompt(
    units,
    options.allowUnconfirmedFacts === true,
  );
  const maximumChapters = Math.max(2, Math.min(10, Math.floor(project.brief.targetDurationSeconds / 30)));
  return structuredCall({
    schema: LongFormOutlineSchema,
    schemaName: 'videobrief_long_form_outline',
    purpose: `long-form-outline:${project.id}`,
    input: [
      '先为长视频建立全片章节提纲。此调用不写逐幕旁白，也不生成 scenes。',
      '每章必须有单一叙事目标、目标时长、可追溯来源引用，并只选择输入中存在的 evidenceUnitIds。',
      '章节之间必须有推进关系，不能把同一论点换词重复；开头建立问题，结尾回到 Creative Brief 的结论和 CTA。',
      `全片目标 ${project.brief.targetDurationSeconds} 秒，生成 2-${maximumChapters} 章；各章 targetDurationSeconds 合计应接近全片目标。`,
      options.allowUnconfirmedFacts
        ? '这是自动草稿，可使用未驳回事实，但必须保留审慎措辞和不确定项。'
        : '只能使用已确认事实。',
      options.instruction?.trim() ? `用户修改要求：${options.instruction.trim()}` : '',
      `Creative Brief: ${JSON.stringify(project.brief)}`,
      `可用证据单元 ID：${units.map((unit) => unit.id).join(', ')}`,
      `sourceReferences.sourceId 只能逐字使用这些真实来源 ID：${[...new Set(units.map((unit) => unit.sourceId))].join(', ')}。`,
      'sourceId 必须逐字节复制，不得添加空格、方向标记或其他不可见 Unicode 字符。',
      '证据单元 ID 只能写入 evidenceUnitIds；即使证据单元 ID 形如 source-02:whole，也禁止把它写入 sourceReferences.sourceId。',
      'sourceReferences 必须直接复用输入 facts[].sourceReferences 中的有效定位，不得自行猜测、扩大或改写定位范围。',
      'visualDescription 只能用于 visualRequirement，不能作为旁白、结论或事实主张的依据。',
      'locatorType=line 时 lineStart 和 lineEnd 必须复制为大于等于 1 的整数；locatorType=time 时 start 和 end 必须复制为非负数字。',
      options.validationFeedback?.trim()
        ? `前一次结果未通过服务端校验：${options.validationFeedback.trim()}。必须修正这个具体问题并重新返回完整提纲。`
        : '',
      JSON.stringify(promptUnits),
    ].filter(Boolean).join('\n'),
    validate,
  });
}

export function planLongFormChapter(
  project: ShortVideoProject,
  outline: LongFormOutline,
  chapterIndex: number,
  validate?: (data: z.infer<typeof LongFormChapterPlanSchema>) => void,
  options: {
    instruction?: string;
    allowUnconfirmedFacts?: boolean;
    validationFeedback?: string;
  } = {},
) {
  const chapter = outline.chapters[chapterIndex];
  if (!chapter) throw new Error(`Long-form chapter index ${chapterIndex} does not exist.`);
  const units = selectLongFormEvidenceUnits(
    buildLongFormEvidenceUnits(project, options.allowUnconfirmedFacts === true),
    chapter.evidenceUnitIds,
  );
  const promptUnits = longFormEvidenceUnitsForPrompt(
    units,
    options.allowUnconfirmedFacts === true,
    chapter.sourceReferences,
  );
  const sceneTarget = Math.max(2, Math.ceil(chapter.targetDurationSeconds / 15));
  const minimumScenes = Math.max(2, Math.ceil(chapter.targetDurationSeconds / 20));
  const maximumScenes = Math.max(minimumScenes, Math.ceil(chapter.targetDurationSeconds / 8));
  const narrationBudget = longFormNarrationBudget(chapter.targetDurationSeconds);
  const narrationTarget = Math.round(chapter.targetDurationSeconds * 3.6);
  return structuredCall({
    schema: LongFormChapterPlanSchema,
    schemaName: 'videobrief_long_form_chapter',
    purpose: `long-form-chapter:${project.id}:${String(chapterIndex + 1).padStart(2, '0')}`,
    input: [
      `只生成第 ${chapterIndex + 1}/${outline.chapters.length} 章，不得生成或改写其他章节。`,
      `本章标题：${chapter.title}`,
      `本章目标：${chapter.objective}`,
      `本章目标时长：${chapter.targetDurationSeconds} 秒。必须生成 ${minimumScenes}-${maximumScenes} 个 scenes，目标约 ${sceneTarget} 个；每个 scene 只承载一个 8-20 秒叙事点。`,
      `本章全部 narration 合计必须在 ${narrationBudget.minimumCharacters}-${narrationBudget.maximumCharacters} 个非空白字符之间，这是服务端硬门禁，少于下限或多于上限都会拒绝整个章节。`,
      `旁白应以约 ${narrationTarget} 个非空白字符为目标；优先压缩到中间值，不要贴近 ${narrationBudget.maximumCharacters} 字上限。`,
      'voiceoverScript 必须逐字等于 scenes narration 按顺序拼接后的内容；不能用摘要、提纲或省略号代替完整口播。',
      '只能使用本次输入的证据单元，不得借用其他章节证据，不得新增来源中不存在的事实。',
      '每个 scene 必须给出可定位 sourceReferences 和明确 visualRequirement。',
      `sourceReferences.sourceId 只能逐字使用这些真实来源 ID：${[...new Set(units.map((unit) => unit.sourceId))].join(', ')}。`,
      'sourceId 必须逐字节复制，不得添加空格、方向标记或其他不可见 Unicode 字符。',
      `证据单元 ID（${units.map((unit) => unit.id).join(', ')}）只能用于 evidenceUnitIds 上下文，禁止写入 sourceReferences.sourceId。`,
      'sourceReferences 必须直接复用输入 facts[].sourceReferences 中的有效定位，不得自行猜测、扩大或改写定位范围。',
      'visualDescription 只能用于 visualRequirement，不能作为 narration、summary 或事实主张的依据。',
      'locatorType=line 时 lineStart 和 lineEnd 必须复制为大于等于 1 的整数；locatorType=time 时 start 和 end 必须复制为非负数字。',
      options.validationFeedback?.trim()
        ? `前一次结果未通过服务端校验：${options.validationFeedback.trim()}。必须修正这个具体问题并重新返回完整章节。`
        : '',
      options.instruction?.trim() ? `用户修改要求：${options.instruction.trim()}` : '',
      `全片上下文：${JSON.stringify({
        conclusion: outline.conclusion,
        hook: outline.hook,
        chapters: outline.chapters.map((item) => ({ title: item.title, objective: item.objective })),
      })}`,
      `Creative Brief: ${JSON.stringify(project.brief)}`,
      JSON.stringify(promptUnits),
    ].filter(Boolean).join('\n'),
    validate,
  });
}

export function planNarrative(
  project: ShortVideoProject,
  validate?: (data: z.infer<typeof NarrativePlanSchema>) => void,
  options: { instruction?: string; allowUnconfirmedFacts?: boolean } = {},
) {
  const evidence = projectEvidence(project, options.allowUnconfirmedFacts === true);
  const allowedSourceIds = evidence.sources.map((source) => source.id);
  const narrationBudget = Math.max(30, Math.round(project.brief.targetDurationSeconds * 4.5));
  const longFormSceneGuidance = project.brief.targetDurationSeconds >= 180
    ? `这是长视频：outline 按 4-10 个顺序章节组织，scenes 必须严格按 outline 的章节顺序排列；每个 scene 只承载一个 8-20 秒叙事点，建议生成 ${Math.max(12, Math.ceil(project.brief.targetDurationSeconds / 15))} 个 scenes，不能用少量超长静态场景填满时长。`
    : '这是短视频：保持场景紧凑，每个场景只承载一个核心信息。';
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
      longFormSceneGuidance,
      `成片目标是 ${project.brief.targetDurationSeconds} 秒。全部 scenes[].narration 合计最多 ${narrationBudget} 个非空白字符；每段只保留一个核心信息，voiceoverScript 必须与精简后的旁白一致。`,
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
  const approvedSourceIds = new Set(project.materialReview.approvedSourceIds);
  const visualSources = project.sources.filter(
    (source) => approvedSourceIds.has(source.id)
      && (source.sourceType === 'video' || source.sourceType === 'image'),
  );
  return structuredCall({
    schema: CandidateRankingSchema,
    schemaName: 'videobrief_candidate_ranking',
    purpose: `candidate-ranking:${project.id}`,
    input: [
      '为每个场景从给定的自有或已登记素材中选择一个候选画面。',
      '只允许返回输入中存在的 sourceId；必须说明匹配理由。',
      '相关性满足时必须优先选择视频；图片只能补充视频无法表达的信息，不得把整条视频排成截图轮播。',
      'official_demo 只用于项目身份、界面和明确功能；broll 用于开发、阅读、文档处理等通用过程旁白；evidence 只短时证明具体信息。不要把相似项目的演示当成当前项目官方素材。',
      `sourceId 只能逐字使用：${visualSources.map((source) => source.id).join(', ')}。`,
      '视频给出合理时间范围，图片时间范围使用 0 到场景建议时长。',
      JSON.stringify({
        scenes: project.scenes.map((scene, sceneIndex) => ({ sceneIndex, title: scene.title, visualRequirement: scene.visualRequirement, sourceReferences: scene.sourceReferences })),
        sources: visualSources.map((source) => ({
          id: source.id,
          type: source.sourceType,
          materialRole: source.materialRole,
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

export function rankLongFormChapterCandidates(
  project: ShortVideoProject,
  chapter: ProjectChapter,
  scenes: ShortVideoProjectScene[],
  validate?: (data: z.infer<typeof CandidateRankingSchema>) => void,
) {
  const allowedSourceIds = new Set(longFormChapterVisualSourceIds(project, chapter));
  const visualSources = project.sources.filter((source) => allowedSourceIds.has(source.id));
  const selectedUnits = selectLongFormEvidenceUnits(
    buildLongFormEvidenceUnits(project, true),
    chapter.evidenceUnitIds ?? [],
  );
  return structuredCall({
    schema: CandidateRankingSchema,
    schemaName: 'videobrief_long_form_chapter_candidates',
    purpose: `candidate-ranking:${project.id}:${chapter.id}`,
    input: [
      `只为章节 ${chapter.id}「${chapter.title}」排序画面候选，不得处理其他章节。`,
      '每个 scene 必须返回至少一个候选；只允许使用本章证据来源或已批准的通用 broll。',
      '候选时间窗必须落在输入证据章节范围内，并足以覆盖对应旁白；不得复用一个通用窗口解释不同事实。',
      `sourceId 只能逐字使用：${visualSources.map((source) => source.id).join(', ')}。`,
      JSON.stringify({
        chapter: {
          id: chapter.id,
          title: chapter.title,
          objective: chapter.objective,
          targetDurationSeconds: chapter.targetDurationSeconds,
        },
        scenes: scenes.map((scene, sceneIndex) => ({
          sceneIndex,
          title: scene.title,
          narration: scene.narration,
          visualRequirement: scene.visualRequirement,
          sourceReferences: scene.sourceReferences,
        })),
        evidenceUnits: selectedUnits.map((unit) => ({
          id: unit.id,
          sourceId: unit.sourceId,
          start: unit.start,
          end: unit.end,
          summary: unit.summary,
          visualDescription: unit.visualDescription,
          facts: unit.facts,
        })),
        sources: visualSources.map((source) => ({
          id: source.id,
          type: source.sourceType,
          materialRole: source.materialRole,
          rightsStatus: source.rightsStatus,
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
