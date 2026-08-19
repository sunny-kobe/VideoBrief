import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { applyProductionWorkflowAction } from '../src/productionWorkflow';
import type { ShortVideoProjectScene, ShortVideoSource } from '../src/shortVideoBrief';
import {
  approveProjectMaterials,
  readBrief,
  registerProjectSourceFile,
  updateCanonicalProject,
} from '../src/shortVideoProjectServer';

const projectId = 'microwave-mechanism-style-poc-20260819';
const now = new Date().toISOString();

type SourceDefinition = {
  key: 'microwave' | 'popcorn' | 'steak' | 'stirring';
  filePath: string;
  label: string;
  originUrl: string;
  rightsNote: string;
  visualDescription: string;
};

const sourceDefinitions: SourceDefinition[] = [
  {
    key: 'microwave',
    filePath: 'public/project-assets/microwave-mechanism-style-poc-20260819/pexels-4710526-heating-bread.mp4',
    label: '真实家用微波炉倒计时与取出食物',
    originUrl: 'https://www.pexels.com/video/video-of-person-heating-up-a-bread-on-a-microwave-4710526/',
    rightsNote: '作者 Aghyad Najjar，Pexels 页面标注 Free to use。Pexels License 允许免费使用和修改且不强制署名；计划窗口原生无平台或账号水印。',
    visualDescription: '横版家用微波炉倒计时结束，人物开门取出食物并重新关门。',
  },
  {
    key: 'popcorn',
    filePath: 'public/project-assets/microwave-mechanism-style-poc-20260819/pexels-854958-popcorn-popping.mp4',
    label: '爆米花受热爆开微距',
    originUrl: 'https://www.pexels.com/video/popcorn-popping-854958/',
    rightsNote: '上传者 Pixabay，Pexels 页面明确标注 Free to use (CC0)；计划窗口原生无平台或账号水印。作为食物受热的微距示意，不冒充特定微波炉内部实录。',
    visualDescription: '横版微距俯拍，玉米粒连续爆开成为爆米花，画面变化密集。',
  },
  {
    key: 'steak',
    filePath: 'public/project-assets/microwave-mechanism-style-poc-20260819/pexels-4253328-slicing-steak-excerpt.mp4',
    label: '切开厚牛排横截面',
    originUrl: 'https://www.pexels.com/video/a-person-cutting-meat-on-a-cutting-board-4253328/',
    rightsNote: '作者 cottonbro studio，Pexels 页面标注 Free to use。Pexels License 允许免费使用和修改且不强制署名；本地文件是原片 1080p 截取版，计划窗口原生无平台或账号水印。作为厚食物横截面示意，不暗示该牛排由微波炉加热。',
    visualDescription: '横版近景，厨师连续切开厚牛排，食物外层与中心横截面清楚可见。',
  },
  {
    key: 'stirring',
    filePath: 'public/project-assets/microwave-mechanism-style-poc-20260819/pexels-29117384-stirring-hot-food-excerpt.mp4',
    label: '蒸汽热食翻动与搅拌',
    originUrl: 'https://www.pexels.com/video/sizzling-korean-stir-fry-in-hot-pan-29117384/',
    rightsNote: '作者 Paul Bill，Pexels 页面标注 Free to use。Pexels License 允许免费使用和修改且不强制署名；本地文件是原片 1080p 截取版，计划窗口原生无平台或账号水印。只承担翻动与搅拌动作示意，不暗示这是微波炉内实录。',
    visualDescription: '横版近景，木铲持续翻动带蒸汽的热食，动作和热气都清楚。',
  },
];

function ensureSource(definition: SourceDefinition): ShortVideoSource {
  const current = readBrief(projectId);
  const existing = current.sources.find((source) => source.originUrl === definition.originUrl);
  if (existing) return existing;

  const absolutePath = resolve(definition.filePath);
  const bytes = statSync(absolutePath).size;
  const contentHash = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
  const storedName = basename(absolutePath);
  return registerProjectSourceFile(
    projectId,
    storedName,
    storedName,
    bytes,
    contentHash,
    {
      label: definition.label,
      originUrl: definition.originUrl,
      mimeType: 'video/mp4',
      materialRole: 'broll',
      verificationStatus: 'verified',
      rightsStatus: 'cleared',
      rightsNote: definition.rightsNote,
    },
  ).source;
}

const sources = Object.fromEntries(sourceDefinitions.map((definition) => [definition.key, ensureSource(definition)])) as Record<SourceDefinition['key'], ShortVideoSource>;
const molecularAnimationSource = readBrief(projectId).sources.find(
  (source) => source.originUrl === 'local://videobrief-original/microwave-mechanism-animation-v2',
);
if (!molecularAnimationSource) throw new Error('Missing molecular mechanism animation source.');

const narrations = [
  '外面已经烫嘴，里面怎么还是冷的？因为微波炉根本不是从中心开始加热。',
  '它先把电变成微波，送进炉腔。看不见的微波在里面来回反射，一部分进入食物。',
  '食物里的水分子和带电粒子，被电场来回推动。它们彼此碰撞，能量就变成了热。',
  '但微波只能深入一段距离。厚食物的中心，还是要等外面的热慢慢传进去。',
  '炉腔里有些位置能量强，有些位置弱。转盘带着食物走，尽量让每一部分都经过热区。',
  '所以微波炉加热快，却不一定均匀。大块食物翻个面、搅一搅，再静置一会儿，会热得更均匀。',
] as const;

const sceneDefinitions = [
  {
    source: sources.microwave,
    start: 7.4,
    end: 14.333333,
    eyebrow: '一个常见情况',
    title: '外面烫了，里面还冷？',
    subtitle: '它不是从中心开始加热',
    visualRequirement: '前三秒直接看到微波炉结束加热并开门取食物；用简洁大字提出“外烫内冷”，实拍始终是画面主体。',
    matchReason: '真实微波炉结束、开门和取食动作直接建立日常使用场景；前三秒由编辑标题强化反差，不使用 3D 或自制主体素材。',
    factSourceId: 'source-01',
    showEditorialOverlay: true,
  },
  {
    source: sources.microwave,
    start: 0,
    end: 7.3,
    eyebrow: '先看炉腔',
    title: '能量被送进炉腔',
    subtitle: '看不见，但食物正在加热',
    visualRequirement: '使用真实微波炉倒计时和炉内食物动态建立能量进入炉腔的现实情境；不把库存镜头当作微波传播的直接测量。',
    matchReason: '真实微波炉持续运行，倒计时和炉内食物可见，适合承接“电变成微波并送进炉腔”的情境说明。',
    factSourceId: 'source-01',
    showEditorialOverlay: false,
  },
  {
    source: molecularAnimationSource,
    start: 20,
    end: 27.366667,
    eyebrow: '能量变成热',
    title: '食物内部开始升温',
    subtitle: '电场来回推动，碰撞把能量变成热',
    visualRequirement: '使用简洁 2.5D 原理动画表现水分子和带电粒子随交变电场来回摆动；只解释肉眼看不见的机制，不扩展成三维建模。',
    matchReason: '分子随电场左右摆动、碰撞点亮的动画直接承接当前旁白；这是明确的机制示意，不冒充微观实拍。',
    factSourceId: 'source-02',
    showEditorialOverlay: false,
  },
  {
    source: sources.steak,
    start: 1.1,
    end: 7.166667,
    eyebrow: '厚食物更明显',
    title: '中心要再等一会儿',
    subtitle: '外层先热，热量再慢慢传进去',
    visualRequirement: '使用真实切开厚牛排的横版近景，让外层与中心横截面直接可见；旁白解释热继续向中心传递，不使用三维食物模型。',
    matchReason: '连续切开动作直接露出厚食物横截面，能承接“中心仍要等热传进去”；不暗示该牛排由微波炉加热。',
    factSourceId: 'source-01',
    showEditorialOverlay: false,
  },
  {
    source: sources.microwave,
    start: 7.4,
    end: 15.466667,
    eyebrow: '为什么要转',
    title: '让食物经过不同热区',
    subtitle: '尽量少一点局部过热和过冷',
    visualRequirement: '使用真实微波炉炉灯和炉内食物运动窗口，重点让观众看到食物在加热过程中改变位置。',
    matchReason: '炉灯亮起、倒计时变化，炉门内可见食物随转盘移动，直接支持“让每一部分经过不同热区”的操作机制。',
    factSourceId: 'source-03',
    showEditorialOverlay: false,
    sourceOverride: sources.microwave.id === sources.microwave.id ? sources.microwave : sources.microwave,
  },
  {
    source: sources.stirring,
    start: 0,
    end: 8.466667,
    eyebrow: '最实用的一步',
    title: '翻面、搅拌、静置',
    subtitle: '让热量再分一分',
    visualRequirement: '使用真实蒸汽热食被持续翻动和搅拌的横版近景；作为使用动作示意，不暗示画面发生在微波炉内。',
    matchReason: '连续搅拌、翻动和蒸汽直接支持结尾动作建议，视觉变化足够，不需要程序化填充或循环。',
    factSourceId: 'source-03',
    showEditorialOverlay: false,
  },
] as const;

// Scene 05 uses the dedicated front-on microwave source so the turntable remains readable.
const turntableSource = ensureSource({
  key: 'microwave',
  filePath: 'public/project-assets/microwave-mechanism-style-poc-20260819/pexels-4710717-microwave-use.mp4',
  label: '真实微波炉开门、关门与转盘运行',
  originUrl: 'https://www.pexels.com/video/video-of-person-using-microwave-4710717/',
  rightsNote: '作者 Aghyad Najjar，Pexels 页面标注 Free to use。Pexels License 允许免费使用和修改且不强制署名；计划窗口原生无平台或账号水印。',
  visualDescription: '横版正面视角，人物操作微波炉，炉灯亮起后食物随转盘持续转动。',
});

const scenes: ShortVideoProjectScene[] = sceneDefinitions.map((definition, index) => {
  const id = `scene-${String(index + 1).padStart(2, '0')}`;
  const source = index === 4 ? turntableSource : definition.source;
  const start = index === 4 ? 6 : definition.start;
  const end = index === 4 ? 14.066667 : definition.end;
  const candidateId = `candidate-${id}-v3-real`;
  return {
    id,
    chapterId: '',
    enabled: true,
    sourceId: source.id,
    sourceStart: start,
    sourceEnd: end,
    mediaFit: 'cover',
    mediaMotion: 'none',
    showEditorialOverlay: definition.showEditorialOverlay,
    eyebrow: definition.eyebrow,
    title: definition.title,
    subtitle: definition.subtitle,
    narration: narrations[index],
    visualRequirement: definition.visualRequirement,
    sourceReferences: [
      { sourceId: definition.factSourceId, locatorType: 'file', note: `支撑第 ${index + 1} 幕机制说明` },
      { sourceId: source.id, locatorType: 'time', start, end, note: `v3 实拍主镜头，第 ${index + 1} 幕` },
    ],
    candidates: [{
      id: candidateId,
      sourceId: source.id,
      assetPath: source.assetPath,
      mediaType: 'video',
      sourceStart: start,
      sourceEnd: end,
      matchReason: definition.matchReason,
      rightsStatus: 'cleared',
    }],
    selectedCandidateId: candidateId,
    selectionStatus: 'codex_reviewed',
    selectionReviewedAt: now,
    selectionNote: '已检查计划窗口 start/mid/end、原生分辨率、动作完整性、语义角色和平台水印；最终仍需通过正式 Material Quality Gate。',
    generatedBy: 'ai',
    userEdited: true,
  };
});

const sourceDefinitionByUrl = new Map(sourceDefinitions.map((definition) => [definition.originUrl, definition]));
sourceDefinitionByUrl.set(turntableSource.originUrl, {
  ...sourceDefinitions[0],
  originUrl: turntableSource.originUrl,
  visualDescription: '横版正面视角，人物操作微波炉，炉灯亮起后食物随转盘持续转动。',
});

updateCanonicalProject(projectId, (project) => ({
  ...project,
  brief: {
    ...project.brief,
    style: '网页真实动态素材主导；真实微波炉、食物和人物动作承担主体，只有肉眼不可见的分子机制使用简洁 2.5D 动画，不使用 3D。',
  },
  sources: project.sources.map((source) => {
    const definition = sourceDefinitionByUrl.get(source.originUrl);
    if (!definition) return source;
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
        model: 'manual-stock-review',
        promptVersion: 'microwave-real-footage-v3',
        cacheHit: false,
        error: '',
      },
      analysis: {
        ...source.analysis,
        extractedText: '',
        visualDescription: definition.visualDescription,
        hierarchicalSummary: '网页真实动态素材，经人工检查后只承担其实际可见的情境、动作或机制示意角色。',
        facts: [],
        uncertainties: [],
        transcript: [],
        chapters: [],
      },
    };
  }),
  scenes,
  technical_status: 'stale',
  rights_status: 'cleared',
  materialQualityReview: undefined,
  platformCopy: {
    ...project.platformCopy,
    coverTitle: '为什么外面烫了，里面还是冷的？',
    title: '微波炉到底怎么把食物变热？',
    description: '为什么微波炉加热很快，却常常一边烫、一边冷？看懂能量怎么进入食物，以及转盘到底有什么用。',
  },
}));

updateCanonicalProject(projectId, (project) => applyProductionWorkflowAction(
  project,
  { renderState: 'missing', acceptancePassed: false, packageReady: false, videoSha256: '', packageSha256: '' },
  {
    type: 'approve_topic',
    decidedBy: '用户',
    note: '用户要求网页真实动态素材保持主体，同时保留水分子随电场来回摆动的关键原理动画，不使用 3D。',
  },
));

updateCanonicalProject(projectId, (project) => applyProductionWorkflowAction(
  project,
  { renderState: 'missing', acceptancePassed: false, packageReady: false, videoSha256: '', packageSha256: '' },
  {
    type: 'approve_research',
    decidedBy: '用户',
    note: '机制事实继续沿用已批准的一手研究；Pexels 实拍只承担生活情境、食物状态和动作示意，不替代事实来源。',
  },
));

approveProjectMaterials(projectId, [...new Set(scenes.map((scene) => scene.sourceId))]);

console.log(JSON.stringify({
  projectId,
  sceneCount: scenes.length,
  selectedSourceIds: [...new Set(scenes.map((scene) => scene.sourceId))],
  selectedWindows: scenes.map((scene) => ({
    sceneId: scene.id,
    sourceId: scene.sourceId,
    sourceStart: scene.sourceStart,
    sourceEnd: scene.sourceEnd,
  })),
}, null, 2));
