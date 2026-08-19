import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { applyProductionWorkflowAction } from '../src/productionWorkflow';
import type { ShortVideoProjectScene } from '../src/shortVideoBrief';
import {
  approveProjectMaterials,
  importProjectSource,
  updateCanonicalProject,
} from '../src/shortVideoProjectServer';

const projectId = 'microwave-mechanism-style-poc-20260819';
const sourceVideoPath = resolve('output/experiments/microwave-mechanism-poc/mechanism-source-v2.mp4');
const now = new Date().toISOString();
const sceneDurations = [6.933333, 7.3, 7.366667, 6.066667, 8.066667, 8.466667] as const;

const visual = importProjectSource(
  projectId,
  'microwave-mechanism-original-animation-v2.mp4',
  new Uint8Array(readFileSync(sourceVideoPath)),
  {
    label: '微波炉工作机制原创质感动画 v2',
    originUrl: 'local://videobrief-original/microwave-mechanism-animation-v2',
    mimeType: 'video/mp4',
    materialRole: 'broll',
    verificationStatus: 'verified',
    rightsStatus: 'cleared',
    rightsNote: 'VideoBrief 使用 Remotion 从零绘制和渲染的原创程序动画；不含第三方视频、平台水印、人物肖像或品牌素材。',
  },
).source;

const narrations = [
  '外面已经烫嘴，里面怎么还是冷的？因为微波炉根本不是从中心开始加热。',
  '它先把电变成微波，送进炉腔。看不见的微波在里面来回反射，一部分进入食物。',
  '食物里的水分子和带电粒子，被电场来回推动。它们彼此碰撞，能量就变成了热。',
  '但微波只能深入一段距离。厚食物的中心，还是要等外面的热慢慢传进去。',
  '炉腔里有些位置能量强，有些位置弱。转盘带着食物走，尽量让每一部分都经过热区。',
  '所以微波炉加热快，却不一定均匀。大块食物翻个面、搅一搅，再静置一会儿，会热得更均匀。',
] as const;

const sceneMeta = [
  ['真实体验', '外面烫，里面冷', '它不是从中心开始加热', 'source-01'],
  ['能量入口', '电变成微波', '看不见的能量进入食物', 'source-01'],
  ['食物发热', '来回推动，彼此碰撞', '能量就变成了热', 'source-02'],
  ['加热深度', '微波只能深入一段距离', '厚食物中心还要等热传进去', 'source-01'],
  ['冷热不均', '转盘让食物经过热区', '尽量照顾到每一部分', 'source-03'],
  ['实用结论', '翻面、搅拌、静置', '加热会更均匀', 'source-03'],
] as const;

const scenes: ShortVideoProjectScene[] = sceneMeta.map((meta, index) => {
  const start = index * 10;
  const end = start + sceneDurations[index];
  const id = `scene-${String(index + 1).padStart(2, '0')}`;
  const candidateId = `candidate-${id}-v2`;
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
    visualRequirement: `使用原创质感动画第 ${index + 1} 幕，用普通观众能直接理解的画面解释“${meta[1]}”。`,
    sourceReferences: [
      { sourceId: meta[3], locatorType: 'file', note: `支撑第 ${index + 1} 幕通俗机制说明` },
      { sourceId: visual.id, locatorType: 'time', start, end, note: `原创动画 v2 第 ${index + 1} 幕` },
    ],
    candidates: [{
      id: candidateId,
      sourceId: visual.id,
      assetPath: visual.assetPath,
      mediaType: 'video',
      sourceStart: start,
      sourceEnd: end,
      matchReason: `第 ${index + 1} 个独立质感动画窗口与当前口语化旁白对应，无循环、无第三方水印。`,
      rightsStatus: 'cleared',
    }],
    selectedCandidateId: candidateId,
    selectionStatus: 'codex_reviewed',
    selectionReviewedAt: now,
    selectionNote: `已按用户反馈改为口语化表达，并核对第 ${index + 1} 幕的画面与旁白。`,
    generatedBy: 'ai',
    userEdited: true,
  };
});

updateCanonicalProject(projectId, (project) => ({
  ...project,
  brief: {
    ...project.brief,
    objective: '用约 45 秒，让普通观众直观理解微波炉为什么加热快、为什么会外热内冷，以及转盘有什么用。',
    targetDurationSeconds: 45,
    tone: '口语、直观、像朋友解释日常现象，不堆术语和免责声明。',
    style: '深色产品广告质感的原创连续机制动画；前三秒直接呈现“外面烫、里面冷”的反差。',
    coreMessage: '微波进入食物一段距离并转化成热，厚食物中心仍靠热传进去；转盘帮助食物经过不同热区。',
    cta: '大块食物翻面、搅拌并静置一会儿，让加热更均匀。',
  },
  editorial: {
    ...project.editorial,
    claim: '微波炉把能量送进食物，但厚食物中心仍要等热传进去，所以加热快不等于处处均匀。',
    whyItMatters: '它解释了最常见的使用体验：外面很烫，里面却可能还冷。',
    chinaContext: '面向普通家用微波炉用户，不针对特定品牌或型号。',
    riskNote: '观众层只保留必要的使用提醒；详细事实边界继续留在项目研究记录。',
  },
  sources: project.sources.map((source) => source.id === visual.id ? {
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
      promptVersion: 'microwave-mechanism-v2',
      cacheHit: false,
      error: '',
    },
    analysis: {
      ...source.analysis,
      extractedText: sceneMeta.map((meta) => `${meta[1]}：${meta[2]}`).join('\n'),
      visualDescription: '六幕原创横版机制动画，以深色金属微波炉、食物热区、分子运动和转盘场强展示完整加热过程。',
      hierarchicalSummary: '动画只作通俗机制示意，不冒充特定产品测试或测量结果。',
      facts: [], uncertainties: [], transcript: [], chapters: [],
    },
  } : source),
  scenes,
  render: {
    ...project.render,
    rate: 204,
    voiceStyle: '像一个熟悉生活常识的中文创作者在解释。语气自然、轻松、有交流感，不要播音腔、广告腔或技术报告感。前三秒带一点惊讶，后面像朋友聊天。准确朗读原文，不增加内容。',
  },
  platformCopy: {
    ...project.platformCopy,
    coverTitle: '为什么外面烫了，里面还是冷的？',
    title: '微波炉到底怎么把食物变热？',
    description: '为什么微波炉加热很快，却常常一边烫、一边冷？一分钟看懂能量怎么进入食物，以及转盘到底有什么用。',
  },
  materialQualityReview: undefined,
}));

updateCanonicalProject(projectId, (project) => applyProductionWorkflowAction(
  project,
  { renderState: 'missing', acceptancePassed: false, packageReady: false, videoSha256: '', packageSha256: '' },
  {
    type: 'approve_topic',
    decidedBy: '用户',
    note: '用户明确要求继续优化当前微波炉样片，重点降低 AI 味、提升视觉资产质感与前三秒冲击力。',
  },
));

updateCanonicalProject(projectId, (project) => applyProductionWorkflowAction(
  project,
  { renderState: 'missing', acceptancePassed: false, packageReady: false, videoSha256: '', packageSha256: '' },
  {
    type: 'approve_research',
    decidedBy: '用户',
    note: '本轮只简化观众表达和升级视觉，沿用已经确认的微波炉机制事实来源与研究边界。',
  },
));

approveProjectMaterials(projectId, [visual.id]);

console.log(JSON.stringify({
  projectId,
  sourceVideoPath,
  visualSourceId: visual.id,
  sceneCount: scenes.length,
  narrations,
}, null, 2));
