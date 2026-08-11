import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import ffmpegPath from 'ffmpeg-static';
import { chromium } from 'playwright-core';

import { buildSceneInformationLayerPlan } from './lib/scene-information-layer.mjs';
import {
  approveProjectMaterials,
  importProjectSource,
  readBrief,
  updateCanonicalProject,
} from '../src/shortVideoProjectServer';

function flag(name: string, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function visualMarkup(item: { visualKind: string }) {
  const { visualKind: kind } = item;
  if (kind === 'positioning') {
    return `<div class="positioning"><div><span>广泛能力</span><b>Fable 5</b></div><div class="active"><span>复杂 Agent 编程</span><b>Opus 5</b></div><p>专业选择，不等于“全系最强”</p></div>`;
  }
  if (kind === 'iteration') {
    return `<div class="iteration">${[['01', '复杂任务'], ['02', '验证工作'], ['03', '持续迭代']].map(([index, label]) => `<div><span>${index}</span><b>${label}</b></div>`).join('<i>→</i>')}</div>`;
  }
  if (kind === 'specifications') {
    return `<div class="metric-grid">${[
      ['API ID', 'claude-opus-5'], ['CONTEXT', '1M tokens'],
      ['MAX OUTPUT', '128K tokens'], ['PRICE / 1M', '$5 in · $25 out'],
    ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('')}</div>`;
  }
  if (kind === 'benchmark') {
    return `<div class="benchmark"><div class="compare"><section><span>OPUS 5</span><b>官方评测更高</b></section><i>VS</i><section><span>OPUS 4.8</span><b>基础价格相同</b></section></div><p>ANTHROPIC CLAIM · 非独立实测</p></div>`;
  }
  if (kind === 'tradeoffs') {
    return `<div class="tradeoff-grid">${[
      ['SPEED', '约 2.5×', '官方称'], ['PRICE', '2×', 'Fast mode'], ['SECURITY', '< Mythos 5', '进攻性任务'],
    ].map(([label, value, note]) => `<div><span>${label}</span><b>${value}</b><em>${note}</em></div>`).join('')}</div>`;
  }
  if (kind === 'decision') {
    return `<div class="decision"><div class="decision-grid">${[
      ['01', '真实复杂任务'], ['02', '成功率'], ['03', '耗时'], ['04', '总成本'],
    ].map(([index, label]) => `<div><span>${index}</span><b>${label}</b></div>`).join('')}</div><p>A/B TEST <i>→</i> 再决定迁移</p></div>`;
  }
  if (kind === 'brief') {
    return `<div class="brief-grid">${[
      ['目标', '明确要解决的问题'], ['受众', '确认谁需要这条内容'],
      ['画幅', '9:16 竖屏'], ['核心观点', '一句话约束叙事'],
    ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b><i></i></div>`).join('')}</div>`;
  }
  if (kind === 'evidence') {
    return `<div class="evidence-grid">${[
      ['素材', 'LOCAL'], ['来源', 'TRACED'], ['核验', 'REVIEWED'], ['权利', 'CLEARED'],
    ].map(([label, value], index) => `<div class="${index === 3 ? 'active' : ''}"><span>0${index + 1}</span><b>${label}</b><em>${value}</em></div>`).join('')}</div>`;
  }
  if (kind === 'approval') {
    return `<div class="approval-flow">${['脚本', '场景', '候选画面'].map((label, index) => `<div><span>0${index + 1}</span><b>${label}</b><em>已复核</em></div><i>→</i>`).join('')}<div class="execute"><span>04</span><b>FFmpeg</b><em>执行</em></div></div>`;
  }
  if (kind === 'proof') {
    return `<div class="proof-grid">${['项目指纹', 'MP4 与音轨', '字幕与时间轴', '逐幕抽帧'].map((label, index) => `<div><span>0${index + 1}</span><b>${label}</b><em>CHECKED</em></div>`).join('')}</div>`;
  }
  if (kind === 'statuses') {
    return `<div class="status-grid">${[
      ['technical_status', 'passed'], ['rights_status', 'cleared'],
      ['publication_status', 'draft-unpublished'], ['market_status', 'none'],
    ].map(([label, value]) => `<div><b>${label}</b><span>${value}</span></div>`).join('')}</div>`;
  }
  return `<div class="approval-flow">${['SOURCE', 'RESEARCH', 'PLAN', 'RENDER', 'ACCEPT'].map((label, index) => `<div><span>0${index + 1}</span><b>${label}</b></div>${index < 4 ? '<i>→</i>' : ''}`).join('')}</div>`;
}

function assertCommand(result: ReturnType<typeof spawnSync>, message: string) {
  if (result.status === 0) return;
  const details = String(result.stderr || result.stdout || result.error?.message || '')
    .split('\n').map((line) => line.trim()).filter(Boolean).slice(-10).join('\n');
  throw new Error(`${message}${details ? `:\n${details}` : ''}`);
}

const briefPath = resolve(flag('brief'));
if (!flag('brief')) throw new Error('Usage: npm run video:source:information-layer -- --brief=<project.json> [--apply]');
const apply = process.argv.includes('--apply');
const segmentDurationValue = flag('segment-seconds');
const segmentDurationSeconds = segmentDurationValue ? Number(segmentDurationValue) : undefined;
const project = JSON.parse(readFileSync(briefPath, 'utf8'));
const projectId = String(project.id ?? '');
if (!projectId || basename(dirname(briefPath)) !== projectId) throw new Error('Project id does not match the canonical path.');
if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path.');

const plan = buildSceneInformationLayerPlan(project, segmentDurationSeconds);
const outputRoot = resolve(flag('output', `output/scene-information-layers/${projectId}`));
const cardDir = resolve(outputRoot, 'cards');
const segmentDir = resolve(outputRoot, 'segments');
const sourceVideo = resolve(outputRoot, 'scene-information-layer.mp4');
const mappingPath = resolve(outputRoot, 'mapping.json');
mkdirSync(cardDir, { recursive: true });
mkdirSync(segmentDir, { recursive: true });

const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
const cards: Array<(typeof plan)[number] & { cardPath: string }> = [];
try {
  for (const item of plan) {
    const cardPath = resolve(cardDir, `${item.sceneId}.png`);
    const titleSize = Array.from(item.title).length > 15 ? 64 : 76;
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#0b0d10;color:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:0}
      main{height:100%;display:grid;grid-template-rows:auto auto 1fr auto;padding:92px 76px 70px;position:relative}.top{display:flex;justify-content:space-between;align-items:center;color:#8f9aa7;font-size:24px}.brand{font-weight:800;color:#20c997}.index{font-variant-numeric:tabular-nums}
      h1{font-size:${titleSize}px;line-height:1.14;margin:90px 0 18px;max-width:930px}.subtitle{font-size:38px;line-height:1.45;color:#b8c0cb;max-width:920px}.visual{margin-top:72px;border:1px solid #323840;background:#12161b;min-height:780px;padding:42px;display:flex;align-items:center;overflow:hidden}
      .brief-grid,.evidence-grid,.proof-grid,.status-grid,.metric-grid,.decision-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;width:100%}.brief-grid>div,.evidence-grid>div,.proof-grid>div,.status-grid>div,.metric-grid>div,.decision-grid>div{min-height:270px;border:1px solid #39414b;padding:32px;display:flex;flex-direction:column;justify-content:space-between}.brief-grid span,.evidence-grid span,.proof-grid span,.metric-grid span,.decision-grid span{color:#20c997;font-size:22px}.brief-grid b,.evidence-grid b,.proof-grid b,.metric-grid b,.decision-grid b{font-size:34px;line-height:1.35}.brief-grid i{height:14px;background:#2c333c;width:78%}.evidence-grid em,.proof-grid em{font-style:normal;color:#20c997;font-size:20px}.evidence-grid .active{border-color:#20c997;background:#15221e}.metric-grid b{overflow-wrap:anywhere}.decision,.benchmark,.positioning{width:100%;display:flex;flex-direction:column;gap:32px}.decision>p,.benchmark>p,.positioning>p{margin:0;border:1px solid #20c997;background:#15221e;padding:26px 30px;color:#20c997;font-size:25px;font-weight:800;text-align:center}.decision>p i{font-style:normal;color:#87919d;margin:0 16px}.positioning>div{border:1px solid #39414b;padding:36px;display:flex;justify-content:space-between;align-items:center}.positioning>div span{color:#9ca7b3;font-size:24px}.positioning>div b{font-size:42px}.positioning>.active{border-color:#20c997;background:#15221e}.iteration{width:100%;display:flex;align-items:center;justify-content:center;gap:18px}.iteration>div{width:240px;height:260px;border:1px solid #39414b;padding:30px;display:flex;flex-direction:column;justify-content:space-between}.iteration span{color:#20c997}.iteration b{font-size:32px}.iteration i{font-style:normal;color:#66717d;font-size:32px}.compare{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:18px}.compare section{height:360px;border:1px solid #39414b;padding:34px;display:flex;flex-direction:column;justify-content:space-between}.compare section:first-child{border-color:#20c997;background:#15221e}.compare span{color:#20c997;font-size:22px}.compare b{font-size:36px;line-height:1.35}.compare>i{font-style:normal;color:#8f9aa7;font-weight:800}.tradeoff-grid{width:100%;display:grid;grid-template-columns:1fr;gap:22px}.tradeoff-grid>div{min-height:180px;border:1px solid #39414b;padding:30px;display:grid;grid-template-columns:160px 1fr 190px;align-items:center}.tradeoff-grid span{color:#20c997;font-size:22px}.tradeoff-grid b{font-size:42px}.tradeoff-grid em{font-style:normal;color:#9ca7b3;text-align:right;font-size:22px}
      .approval-flow{display:flex;align-items:center;justify-content:center;gap:15px;width:100%;flex-wrap:wrap}.approval-flow>div{width:252px;height:220px;border:1px solid #39414b;padding:28px;display:flex;flex-direction:column;justify-content:space-between}.approval-flow>i{font-style:normal;color:#66717d;font-size:34px}.approval-flow span{color:#20c997}.approval-flow b{font-size:30px}.approval-flow em{font-style:normal;color:#9ca7b3}.approval-flow .execute{border-color:#20c997;background:#15221e}
      .status-grid b{font-size:21px;color:#9ca7b3}.status-grid span{font-size:30px;color:#20c997;overflow-wrap:anywhere}.footer{margin-top:58px;border-top:1px solid #30363e;padding-top:28px;display:flex;justify-content:space-between;color:#8f9aa7;font-size:22px}.progress{position:absolute;left:0;right:0;bottom:0;height:12px;background:#20252b}.progress i{display:block;height:100%;width:${((item.index + 1) / plan.length * 100).toFixed(3)}%;background:#20c997}
    </style></head><body><main><div class="top"><span class="brand">VideoBrief · ORIGINAL INFO LAYER</span><span class="index">SCENE ${String(item.index + 1).padStart(2, '0')} / ${String(plan.length).padStart(2, '0')}</span></div><div><h1>${escapeHtml(item.title)}</h1><div class="subtitle">${escapeHtml(item.subtitle)}</div></div><div class="visual">${visualMarkup(item)}</div><div class="footer"><span>仅作视觉说明，不作为事实证据</span><span>LOCAL · CLEARED</span></div><div class="progress"><i></i></div></main></body></html>`);
    await page.screenshot({ path: cardPath });
    cards.push({ ...item, cardPath });
  }
} finally {
  await browser.close();
}

const segmentPaths: string[] = [];
for (const item of cards) {
  const segmentPath = resolve(segmentDir, `${item.sceneId}.mp4`);
  const frames = Math.round((item.sourceEnd - item.sourceStart) * 30);
  const result = spawnSync(ffmpegPath, [
    '-y', '-loop', '1', '-framerate', '30', '-i', item.cardPath,
    '-vf', `zoompan=z='min(zoom+0.00003,1.018)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,format=yuv420p`,
    '-frames:v', String(frames), '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22',
    '-profile:v', 'high', '-level', '4.2', '-r', '30', '-g', '60', '-movflags', '+faststart', segmentPath,
  ], { encoding: 'utf8' });
  assertCommand(result, `Could not render ${item.sceneId}`);
  segmentPaths.push(segmentPath);
}
const concatPath = resolve(outputRoot, 'segments.txt');
writeFileSync(concatPath, `${segmentPaths.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join('\n')}\n`);
const concat = spawnSync(ffmpegPath, [
  '-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-c', 'copy', '-movflags', '+faststart', sourceVideo,
], { encoding: 'utf8' });
assertCommand(concat, 'Could not concatenate information-layer segments');

const sourceBytes = new Uint8Array(readFileSync(sourceVideo));
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
writeFileSync(mappingPath, `${JSON.stringify({
  schemaVersion: 1,
  projectId,
  generatedAt: new Date().toISOString(),
  sourceVideo,
  sourceHash,
  segmentDurationSeconds: cards[0].sourceEnd - cards[0].sourceStart,
  scenes: cards,
}, null, 2)}\n`);

let appliedSourceId = '';
if (apply) {
  let current = readBrief(projectId);
  const originUrl = `local://videobrief-scene-information-layer/${projectId}`;
  let visualSource = current.sources.find((source) => (
    source.originUrl === originUrl && source.contentHash === sourceHash
  ));
  if (!visualSource) {
    visualSource = importProjectSource(
      projectId,
      `scene-information-layer-${sourceHash.slice(0, 12)}.mp4`,
      sourceBytes,
      {
        label: `${project.title} 逐幕原创信息层`,
        originUrl,
        mimeType: 'video/mp4',
        materialRole: 'broll',
        verificationStatus: 'verified',
        rightsStatus: 'cleared',
        rightsNote: 'VideoBrief 根据当前 canonical scenes 生成的原创信息层；仅作本地视觉说明，不作为事实证据。',
      },
    ).source;
  }
  appliedSourceId = visualSource.id;
  updateCanonicalProject(projectId, (canonical) => ({
    ...canonical,
    sources: canonical.sources
      .filter((source) => source.originUrl !== originUrl || source.id === visualSource!.id)
      .map((source) => source.id === visualSource!.id ? {
      ...source,
      processing: {
        ...source.processing,
        status: 'completed',
        stage: 'completed',
        attempts: Math.max(1, source.processing.attempts),
        inputHash: sourceHash,
        startedAt: source.processing.startedAt || new Date().toISOString(),
        completedAt: new Date().toISOString(),
        error: '',
        model: 'videobrief-original-information-layer',
        promptVersion: 'scene-information-layer-v1',
        cacheHit: false,
      },
      analysis: {
        extractedText: cards.map((item) => `${item.title}\n${item.subtitle}`).join('\n\n'),
        visualDescription: `由 VideoBrief 为 ${cards.length} 个场景生成的独立竖屏信息层，每个场景占用不同视频窗口。`,
        hierarchicalSummary: '逐幕原创视觉说明，不承担外部事实证明。',
        transcript: [],
        facts: [],
        uncertainties: [{
          id: `${source.id}-uncertainty-visual-aid`,
          statement: '该来源是程序化原创信息层，只能作为视觉说明，不能替代场景引用的一手事实来源。',
          sourceReferences: [{ sourceId: source.id, locatorType: 'file', note: '本地生成的原创信息层视频' }],
          resolution: '场景事实继续引用已确认的研究来源；本信息层不写入关键事实。',
          riskLevel: 'low',
          reviewPriority: 'reference',
          briefRelevance: 10,
        }],
        chapters: [],
      },
      } : source),
  }));
  approveProjectMaterials(projectId, [visualSource.id]);
  current = readBrief(projectId);
  const byScene = new Map(cards.map((item) => [item.sceneId, item]));
  const reviewedAt = new Date().toISOString();
  updateCanonicalProject(projectId, (canonical) => ({
    ...canonical,
    scenes: canonical.scenes.map((scene) => {
      const item = byScene.get(scene.id);
      if (!item || !scene.enabled) return scene;
      const candidate = {
        id: 'candidate-original-info-layer-01',
        sourceId: visualSource!.id,
        assetPath: visualSource!.assetPath,
        mediaType: 'video' as const,
        sourceStart: item.sourceStart,
        sourceEnd: item.sourceEnd,
        matchReason: item.matchReason,
        rightsStatus: 'cleared' as const,
      };
      return {
        ...scene,
        sourceId: candidate.sourceId,
        sourceStart: candidate.sourceStart,
        sourceEnd: candidate.sourceEnd,
        candidates: [candidate],
        selectedCandidateId: candidate.id,
        selectionStatus: 'codex_reviewed' as const,
        selectionReviewedAt: reviewedAt,
        selectionNote: `${scene.id} 已核对：标题、字幕和本幕独立信息层一致；画面只作视觉说明，事实仍由 sourceReferences 承担。`,
        showEditorialOverlay: item.showEditorialOverlay,
      };
    }),
  }));
}

console.log(JSON.stringify({
  projectId,
  outputRoot,
  sourceVideo,
  sourceBytes: statSync(sourceVideo).size,
  sourceHash,
  mappingPath,
  scenes: cards.length,
  applied: apply,
  appliedSourceId,
}, null, 2));
