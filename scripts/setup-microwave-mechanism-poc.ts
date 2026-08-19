import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { applyProductionWorkflowAction } from '../src/productionWorkflow';
import type {
  ResearchFact,
  ResearchUncertainty,
  ShortVideoProjectScene,
} from '../src/shortVideoBrief';
import {
  approveProjectMaterials,
  createProject,
  importProjectSource,
  updateCanonicalProject,
} from '../src/shortVideoProjectServer';

const projectId = 'microwave-mechanism-style-poc-20260819';
const sourceVideoPath = resolve('output/experiments/microwave-mechanism-poc/mechanism-source.mp4');
const now = new Date().toISOString();

const researchNotes = [
  {
    fileName: 'fda-microwave-ovens-review.md',
    label: 'FDA：Microwave Ovens 事实核验笔记',
    originUrl: 'https://www.fda.gov/radiation-emitting-products/resources-you-radiation-emitting-products/microwave-ovens',
    text: `# FDA Microwave Ovens 核验笔记

- 炉内磁控管产生微波，微波在金属腔体内反射并被食物吸收。
- FDA 明确指出：厚食物不是“从里向外”熟；外层主要由微波加热，内部主要靠热传导继续升温。
- 正常工作的微波炉有门锁联动等安全结构；门、铰链、门闩或密封损坏时不应继续使用。

本文件是原创中文核验摘要，不复制 FDA 页面正文，不作为成片画面。`,
  },
  {
    fileName: 'wtamu-dielectric-heating-review.md',
    label: 'WTAMU：介电加热与 2.45GHz 误区核验笔记',
    originUrl: 'https://wtamu.edu/~cbaird/sq/2014/10/15/why-are-the-microwaves-in-a-microwave-oven-tuned-to-water/',
    text: `# 介电加热核验笔记

- 2.45GHz 不是水分子的特殊共振频率。
- 交变电场驱动食物中的极性分子取向变化，分子运动与碰撞把有序运动转成热。
- 会参与吸收的并不只有水分子。

本文件是原创中文核验摘要，不复制来源正文，不作为成片画面。`,
  },
  {
    fileName: 'microwave-cavity-engineering-note.md',
    label: '微波炉腔体、驻波与转盘工程推导笔记',
    originUrl: 'local://videobrief-research/microwave-cavity-engineering-note',
    text: `# 微波炉腔体工程推导笔记

- 金属腔体内的入射波与反射波叠加，可形成场强不同的空间区域，因此固定食物可能出现冷热不均。
- 转盘让食物经过不同场强区域，作用是改善平均程度，不保证温度完全一致。
- 2.45GHz 对应自由空间波长约 12.2cm；门上导电网孔为毫米量级，透明可见但对微波形成屏蔽。实际安全仍依赖完整门体、门锁联动与密封。

本文件是基于公开频率和电磁学边界条件写成的原创工程说明，只支撑机制动画，不作为特定产品测试。`,
  },
] as const;

createProject({
  id: projectId,
  title: '微波炉不是从里面向外烤熟，它究竟怎样加热？',
  brief: {
    objective: '用约 70 到 90 秒讲清微波炉的能量路径、介电加热、冷热不均与转盘作用，并纠正常见误解。',
    audience: '使用过微波炉、但不了解其工作机制的普通中文观众。',
    platform: '本地未发布样片，单横版',
    aspectRatio: '16:9',
    targetDurationSeconds: 82,
    tone: '清楚、克制、带一点反常识，不使用夸张恐吓。',
    style: '原创连续机制动画；复用同一台微波炉剖面模型，以运动和少量大字解释抽象过程。',
    reference: '借鉴抖音“宇宙科普君”微波炉解析的连续剖面、分子动画和机制递进，不复用其画面、旁白、角色、标题或错误表述。',
    coreMessage: '微波炉通过交变电场让食物中的极性分子和离子吸收能量；厚食物中心仍靠热传导，转盘用于缓解腔体驻波造成的冷热不均。',
    cta: '加热较厚或不均匀的食物时，按说明书操作，并通过搅拌或静置让热量继续均匀。',
    prohibitedMaterial: '不得声称微波从里向外烤熟、2.45GHz 是水的特殊共振、只有水分子参与加热、分子每秒完整旋转 24.5 亿圈，或所有情况下都绝无泄漏。',
  },
  workflowOrigin: {
    kind: 'manual',
    sourceUrl: 'https://v.douyin.com/cg_geeWQqiI/',
    summary: '用户指定的表达参考；只借鉴机制动画的叙事方法，不把原视频当作事实来源或成片素材。',
  },
  topicApproval: {
    decidedBy: '用户',
    note: '用户明确同意制作并测试这条微波炉机制解释样片，沿用默认单横版正式画幅。',
  },
});

const importedResearch = researchNotes.map((note) => importProjectSource(
  projectId,
  note.fileName,
  new TextEncoder().encode(note.text),
  {
    label: note.label,
    originUrl: note.originUrl,
    mimeType: 'text/markdown',
    materialRole: 'research',
    verificationStatus: 'verified',
    rightsStatus: 'cleared',
    rightsNote: 'VideoBrief 编写的原创中文事实核验笔记；仅用于内部研究与来源追溯，不进入成片画面。',
  },
));

const visual = importProjectSource(
  projectId,
  'microwave-mechanism-original-animation.mp4',
  new Uint8Array(readFileSync(sourceVideoPath)),
  {
    label: '微波炉工作机制原创程序动画',
    originUrl: 'local://videobrief-original/microwave-mechanism-animation-v1',
    mimeType: 'video/mp4',
    materialRole: 'broll',
    verificationStatus: 'verified',
    rightsStatus: 'cleared',
    rightsNote: 'VideoBrief 使用 Remotion 从零绘制和渲染的原创程序动画；不含第三方视频、平台水印、人物肖像或品牌素材。',
  },
).source;

const researchSourceIds = importedResearch.map((item) => item.source.id);
const [fdaSourceId, wtamuSourceId, engineeringSourceId] = researchSourceIds;

const facts: ResearchFact[] = [
  {
    id: 'fact-magnetron-and-absorption',
    statement: 'FDA 说明微波由炉内磁控管产生，在金属腔体内反射并被食物吸收。',
    sourceReferences: [{ sourceId: fdaSourceId, locatorType: 'file', note: 'FDA Microwave Ovens 工作原理段落' }],
    reviewStatus: 'confirmed', kind: 'claim', reviewPriority: 'required', briefRelevance: 10,
  },
  {
    id: 'fact-not-inside-out',
    statement: 'FDA 明确指出厚食物不是从里面向外熟；外层主要由微波加热，内部主要靠热传导。',
    sourceReferences: [{ sourceId: fdaSourceId, locatorType: 'file', note: 'FDA “inside out” 说明' }],
    reviewStatus: 'confirmed', kind: 'claim', reviewPriority: 'required', briefRelevance: 10,
  },
  {
    id: 'fact-dielectric-heating',
    statement: '介电加热来自交变电场对食物分子的作用以及能量耗散；参与吸收的不只有水分子。',
    sourceReferences: [{ sourceId: wtamuSourceId, locatorType: 'file', note: 'WTAMU dielectric heating 解释' }],
    reviewStatus: 'confirmed', kind: 'claim', reviewPriority: 'required', briefRelevance: 10,
  },
  {
    id: 'fact-no-water-resonance',
    statement: '2.45GHz 不是水分子的特殊共振频率，不能把场频率等同于每个分子的完整旋转次数。',
    sourceReferences: [{ sourceId: wtamuSourceId, locatorType: 'file', note: 'WTAMU 2.45GHz 共振误区说明' }],
    reviewStatus: 'confirmed', kind: 'claim', reviewPriority: 'required', briefRelevance: 10,
  },
  {
    id: 'fact-standing-wave-turntable',
    statement: '金属腔体内的反射叠加会形成场强不均；转盘让食物经过不同区域，从而改善平均程度。',
    sourceReferences: [{ sourceId: engineeringSourceId, locatorType: 'file', note: '腔体边界与转盘作用工程推导' }],
    reviewStatus: 'confirmed', kind: 'claim', reviewPriority: 'required', briefRelevance: 10,
  },
  {
    id: 'fact-door-mesh-scale',
    statement: '2.45GHz 对应自由空间波长约 12.2cm，远大于门上毫米级导电网孔；安全还依赖门体、联动与密封完整。',
    sourceReferences: [
      { sourceId: engineeringSourceId, locatorType: 'file', note: '波长计算与网孔尺度说明' },
      { sourceId: fdaSourceId, locatorType: 'file', note: 'FDA 门体、联动、密封与损坏警告' },
    ],
    reviewStatus: 'confirmed', kind: 'claim', reviewPriority: 'required', briefRelevance: 9,
  },
];

const uncertainties: ResearchUncertainty[] = [
  {
    id: 'uncertainty-food-specific-heating',
    statement: '实际穿透深度、升温速度和冷热分布会随频率、含水量、盐分、形状、装载量和容器变化。',
    sourceReferences: [
      { sourceId: fdaSourceId, locatorType: 'file', note: 'FDA 对厚食物和不同食物加热的边界' },
      { sourceId: engineeringSourceId, locatorType: 'file', note: '原创工程推导的适用边界' },
    ],
    resolution: '成片只讲通用机制，不给固定穿透深度或均匀性承诺，并明确转盘不能保证完全均匀。',
    riskLevel: 'high', reviewPriority: 'required', briefRelevance: 10,
  },
  {
    id: 'uncertainty-safety-absolute',
    statement: '正常设计不等于任何损坏或错误使用情况下都没有泄漏风险。',
    sourceReferences: [{ sourceId: fdaSourceId, locatorType: 'file', note: 'FDA 对损坏门体、门锁和密封的警告' }],
    resolution: '成片不使用“绝对零泄漏”，结尾要求以产品说明书为准，门体损坏时停止使用。',
    riskLevel: 'high', reviewPriority: 'required', briefRelevance: 9,
  },
];

const narrations = [
  '很多人以为，微波炉会从食物里面向外烤熟。其实厚食物的中心，仍主要靠外层传进来的热。',
  '电源先驱动磁控管产生微波，再通过波导送入金属炉腔。微波在腔体里不断反射，进入食物。',
  '交变电场推动极性分子改变取向，也驱动离子移动。它们跟不上电场变化，碰撞和耗散把电磁能变成热。',
  '所以，不是只有表面受热，也不是从正中心开始。微波进入一定深度，剩下的部分再靠热传导继续升温。',
  '金属腔体里的入射波和反射波会叠加，形成场强不同的区域。食物固定不动，就容易出现热点和冷点。',
  '这就是转盘的作用：让食物不断经过不同场强区域，使平均加热更均匀，但它不能保证每一口温度完全相同。',
  '门上的金属网也有尺度设计。微波波长大约十二厘米，远大于网孔；但门体、门锁或密封损坏时，不要继续使用。',
  '最后记住：微波加热来自介电损耗，厚食物中心仍靠传导，转盘只能缓解冷热不均。加热后搅拌或静置一会儿。',
] as const;

const sceneMeta = [
  ['常见误解', '不是从里向外烤熟', '中心仍要靠热传导', fdaSourceId],
  ['能量入口', '磁控管产生微波', '波导把能量送入炉腔', fdaSourceId],
  ['介电加热', '分子跟不上交变电场', '碰撞与耗散把能量变成热', wtamuSourceId],
  ['加热深度', '直接吸收 + 热传导', '不是只热表面，也不是从中心开始', fdaSourceId],
  ['冷热不均', '腔体里会形成驻波', '不同位置的场强并不相同', engineeringSourceId],
  ['转盘作用', '让食物经过不同区域', '改善平均程度，不承诺完全均匀', engineeringSourceId],
  ['门网与安全', '波长远大于网孔', '门体损坏时不要继续使用', fdaSourceId],
  ['机制回顾', '能量、传导与转盘', '一次看懂完整工作链路', engineeringSourceId],
] as const;

const scenes: ShortVideoProjectScene[] = sceneMeta.map((meta, index) => {
  const start = index * 11;
  const end = start + 11;
  const id = `scene-${String(index + 1).padStart(2, '0')}`;
  const candidateId = `candidate-${id}`;
  return {
    id,
    chapterId: '',
    enabled: true,
    sourceId: visual.id,
    sourceStart: start,
    sourceEnd: end,
    mediaFit: 'cover',
    mediaMotion: 'none',
    showEditorialOverlay: false,
    eyebrow: meta[0],
    title: meta[1],
    subtitle: meta[2],
    narration: narrations[index],
    visualRequirement: `使用原创程序动画的第 ${index + 1} 幕直接解释“${meta[1]}”；画面只承担机制示意，事实由研究来源支撑。`,
    sourceReferences: [
      { sourceId: meta[3], locatorType: 'file', note: `支撑第 ${index + 1} 幕机制说明` },
      { sourceId: visual.id, locatorType: 'time', start, end, note: `原创动画第 ${index + 1} 幕，不作为外部事实证据` },
    ],
    candidates: [{
      id: candidateId,
      sourceId: visual.id,
      assetPath: visual.assetPath,
      mediaType: 'video',
      sourceStart: start,
      sourceEnd: end,
      matchReason: `第 ${index + 1} 个独立动画窗口与当前旁白逐项对应，无循环、无第三方水印。`,
      rightsStatus: 'cleared',
    }],
    selectedCandidateId: candidateId,
    selectionStatus: 'codex_reviewed',
    selectionReviewedAt: now,
    selectionNote: `已核对第 ${index + 1} 幕画面、旁白和事实边界；窗口独立且不复用。`,
    generatedBy: 'ai',
    userEdited: false,
  };
});

updateCanonicalProject(projectId, (project) => ({
  ...project,
  editorial: {
    claim: '微波炉通过介电加热把电磁能转成热；它不从内部向外烤熟，转盘主要用来缓解场强不均。',
    whyItMatters: '这三个机制直接解释了为什么厚食物中心可能偏冷、为什么需要转盘，以及哪些流行说法不准确。',
    chinaContext: '本片解释通用家用微波炉机制，不针对特定品牌、型号或国家安全标准。',
    riskNote: '实际加热与泄漏风险取决于食物、容器和设备状态；门体或密封损坏时应停止使用并联系制造商。',
  },
  sources: project.sources.map((source) => {
    const sourceIndex = researchSourceIds.indexOf(source.id);
    if (source.id === visual.id) {
      return {
        ...source,
        processing: {
          ...source.processing,
          status: 'completed' as const,
          stage: 'completed' as const,
          attempts: 1,
          inputHash: source.contentHash,
          startedAt: now,
          completedAt: now,
          model: 'remotion-original-animation',
          promptVersion: 'microwave-mechanism-v1',
          cacheHit: false,
          error: '',
        },
        analysis: {
          ...source.analysis,
          extractedText: sceneMeta.map((meta) => `${meta[1]}：${meta[2]}`).join('\n'),
          visualDescription: '八幕连续原创横版机制动画，复用同一台微波炉剖面，展示能量路径、分子取向、热传导、驻波、转盘和门网。',
          hierarchicalSummary: '程序动画只作机制示意，不冒充特定实验、产品或测量结果。',
          facts: [], uncertainties: [], transcript: [], chapters: [],
        },
      };
    }
    if (sourceIndex >= 0) {
      const sourceFacts = facts.filter((fact) => fact.sourceReferences.some((reference) => reference.sourceId === source.id));
      const sourceUncertainties = uncertainties.filter((item) => item.sourceReferences.some((reference) => reference.sourceId === source.id));
      return {
        ...source,
        processing: {
          ...source.processing,
          status: 'completed' as const,
          stage: 'completed' as const,
          attempts: 1,
          inputHash: source.contentHash,
          startedAt: now,
          completedAt: now,
          model: 'manual-primary-source-review',
          promptVersion: 'microwave-research-20260819-v1',
          cacheHit: false,
          error: '',
        },
        analysis: {
          ...source.analysis,
          extractedText: researchNotes[sourceIndex].text,
          visualDescription: '内部事实核验笔记，不进入成片画面。',
          hierarchicalSummary: researchNotes[sourceIndex].label,
          facts: sourceFacts,
          uncertainties: sourceUncertainties,
          transcript: [], chapters: [],
        },
      };
    }
    return source;
  }),
  research: { transcripts: [], facts, uncertainties },
  scenes,
  render: {
    ...project.render,
    voice: 'zh-CN-YunxiNeural',
    rate: 194,
    voiceEngine: 'edge-tts',
    voiceModel: 'edge-tts-universal',
    voiceProfile: 'natural-tech-zh-v1',
    voiceGenerationMode: 'per-scene',
    mediaFit: 'cover',
    subtitleBottom: 66,
  },
  platformCopy: {
    coverTitle: '微波炉不是从里面向外烤熟',
    title: '微波炉究竟怎样加热？转盘为什么必须转？',
    description: '从磁控管、介电加热到驻波和转盘，用一条原创机制动画讲清微波炉怎样把电磁能变成热。',
    hashtags: ['微波炉', '工作原理', '生活科普', '日常有因'],
  },
}));

updateCanonicalProject(projectId, (project) => applyProductionWorkflowAction(
  project,
  {
    renderState: 'missing', acceptancePassed: false, packageReady: false, videoSha256: '', packageSha256: '',
  },
  {
    type: 'approve_research',
    decidedBy: '用户',
    note: '用户批准继续制作测试样片；研究 Gate 按当前核验事实与纠错边界绑定本次正式生产。',
  },
));

approveProjectMaterials(projectId, [visual.id]);

console.log(JSON.stringify({
  projectId,
  projectPath: `content/projects/${projectId}/project.json`,
  sourceVideoPath,
  visualSourceId: visual.id,
  researchSourceIds,
  scenes: scenes.length,
}, null, 2));
