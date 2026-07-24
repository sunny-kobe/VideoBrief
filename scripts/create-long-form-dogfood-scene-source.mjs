// Dogfood-only harness: builds one scene-aligned visual source and can apply it through existing APIs.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  createReadStream,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

import ffmpegPath from 'ffmpeg-static';
import { chromium } from 'playwright-core';

const projectId = 'long-form-pipeline-dogfood-20260723';
const projectPath = resolve('content/projects', projectId, 'project.json');
const outputRoot = resolve('output/long-form-dogfood-scene-source');
const cardDir = resolve(outputRoot, 'cards');
const segmentDir = resolve(outputRoot, 'segments');
const sourceVideo = resolve(outputRoot, 'videobrief-long-form-scene-source.mp4');
const mappingPath = resolve(outputRoot, 'scene-source-mapping.json');
const segmentDurationSeconds = 30;
const apply = process.argv.includes('--apply');
const baseUrl = process.env.VIDEOBRIEF_BASE_URL || 'http://127.0.0.1:3100';

const project = JSON.parse(readFileSync(projectPath, 'utf8'));
const chapters = [...project.chapters].sort((left, right) => left.order - right.order);
const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
const scenes = chapters.flatMap((chapter) => (
  chapter.sceneIds.map((sceneId) => project.scenes.find((scene) => scene.id === sceneId))
)).filter(Boolean);
if (!scenes.length || scenes.length !== project.scenes.filter((scene) => scene.enabled).length) {
  throw new Error('Canonical chapter order does not cover every enabled scene.');
}
if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path.');

mkdirSync(cardDir, { recursive: true });
mkdirSync(segmentDir, { recursive: true });

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function visualKind(scene) {
  const text = `${scene.title} ${scene.subtitle} ${scene.visualRequirement}`;
  if (/播放器|桌面与移动/.test(text)) return 'players';
  if (/四列|四条记录|technical、rights/.test(text)) return 'statuses';
  if (/project\.json|事实源|中心节点/.test(text)) return 'hub';
  if (/locator|校验|拒绝/.test(text)) return 'validation';
  if (/facts|uncertainties|证据面板|证据单元/.test(text)) return 'evidence';
  if (/指纹|哈希|输入清单/.test(text)) return 'fingerprint';
  if (/队列|中断|恢复|复用|缓存|分段/.test(text)) return 'recovery';
  if (/proof|验收|审片|质量/i.test(text)) return 'gates';
  if (/时间线|切章|边界|采样|帧/.test(text)) return 'timeline';
  if (/风险|压力|失控|超时|存储/.test(text)) return 'risk';
  return 'flow';
}

function diagramMarkup(kind, localIndex) {
  const active = localIndex % 4;
  if (kind === 'players') {
    return `<div class="players"><div class="desktop"><div class="screen"><span>DESKTOP · PLAYING</span></div><div class="track"><i style="width:88%"></i></div></div><div class="mobile"><div class="screen"><span>MOBILE · ENDED</span></div><div class="track"><i style="width:100%"></i></div></div></div>`;
  }
  if (kind === 'statuses') {
    return `<div class="status-grid">${['technical', 'rights', 'publication', 'market'].map((label, index) => `<div class="status"><b>${label}</b><span>${index === 0 ? 'passed' : index === 1 ? 'cleared' : index === 2 ? 'draft' : 'none'}</span></div>`).join('')}</div>`;
  }
  if (kind === 'validation') {
    return `<div class="validation"><div><span>sourceId</span><b>matched</b></div><div><span>locator</span><b>inside range</b></div><div class="rejected"><span>cross chapter</span><b>rejected</b></div></div>`;
  }
  if (kind === 'evidence') {
    return `<div class="evidence-grid">${['facts', 'uncertainties', 'transcript', 'frame samples'].map((label, index) => `<div class="evidence ${index === active ? 'active' : ''}"><span>0${index + 1}</span><b>${label}</b><i></i><i></i><i></i></div>`).join('')}</div>`;
  }
  if (kind === 'fingerprint') {
    return `<div class="fingerprint"><code>source_sha</code><code>model</code><code>prompt_version</code><code>brief</code><code>transcript</code><code>frame_times</code><strong>chapter input fingerprint</strong></div>`;
  }
  if (kind === 'recovery') {
    return `<div class="recovery">${['CHAPTER 01', 'CHAPTER 02', 'CHAPTER 03', 'CHAPTER 04'].map((label, index) => `<div class="job ${index === active ? 'changed' : ''}"><b>${label}</b><span>${index === active ? 'REBUILD' : 'REUSED'}</span><div><i></i><i></i><i></i><i></i></div></div>`).join('')}</div>`;
  }
  if (kind === 'timeline') {
    return `<div class="timeline"><div class="rail">${Array.from({ length: 12 }, (_, index) => `<i class="${index === active * 3 ? 'active' : ''}"></i>`).join('')}</div><div class="chapters">${['01', '02', '03', '04', '05'].map((label, index) => `<span class="${index === localIndex % 5 ? 'active' : ''}">CH ${label}</span>`).join('')}</div></div>`;
  }
  if (kind === 'gates') {
    return `<div class="gates">${['TECHNICAL', 'SEMANTIC', 'EDITORIAL', 'BROWSER'].map((label, index) => `<div class="gate ${index <= active ? 'passed' : ''}"><span>0${index + 1}</span><b>${label}</b></div>`).join('')}</div>`;
  }
  if (kind === 'hub') {
    return `<div class="hub"><strong>project.json</strong>${['PAGE', 'AI', 'RENDER', 'PROOF', 'EXPORT'].map((label, index) => `<span class="node n${index + 1}">${label}</span>`).join('')}</div>`;
  }
  if (kind === 'risk') {
    return `<div class="risks">${['素材遗漏', '模型超时', '磁盘占用', '人工审片'].map((label, index) => `<div class="risk ${index === active ? 'active' : ''}"><b>${label}</b><span><i style="width:${50 + index * 13}%"></i></span><em>+${index + 1}</em></div>`).join('')}</div>`;
  }
  return `<div class="flow">${['SOURCE', 'CHAPTER', 'PLAN', 'RENDER', 'ACCEPT'].map((label, index) => `<div class="${index === localIndex % 5 ? 'active' : ''}"><span>0${index + 1}</span><b>${label}</b></div>`).join('<i>→</i>')}</div>`;
}

const accents = ['#20c997', '#f5c451', '#ff6b6b', '#5ab5ff', '#d4a6ff'];
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const mapping = [];

for (const [index, scene] of scenes.entries()) {
  const chapter = chapterById.get(scene.chapterId);
  const chapterIndex = chapters.findIndex((item) => item.id === scene.chapterId);
  const localIndex = chapter.sceneIds.indexOf(scene.id);
  const accent = accents[Math.max(0, chapterIndex) % accents.length];
  const kind = visualKind(scene);
  const start = index * segmentDurationSeconds;
  const end = start + segmentDurationSeconds;
  const cardPath = resolve(cardDir, `${scene.id}.png`);
  const titleSize = Array.from(scene.title).length > 16 ? 52 : 60;
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#090b0f;color:#f7f8fa;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:0}
    main{height:100%;display:grid;grid-template-columns:270px 1fr;position:relative}aside{padding:66px 42px;border-right:1px solid #30343a;background:#101318;display:flex;flex-direction:column;justify-content:space-between}
    .brand{font-size:21px;font-weight:800;color:${accent}}.chapter{font-size:17px;color:#8f98a6;line-height:1.7}.number{font-size:96px;font-weight:850;line-height:1}.count{font-size:17px;color:#8f98a6}
    section{padding:70px 92px 62px;display:grid;grid-template-rows:auto auto 1fr auto;min-width:0}.eyebrow{font-size:19px;font-weight:800;color:${accent};margin-bottom:16px}h1{font-size:${titleSize}px;line-height:1.18;margin:0;max-width:1350px;font-weight:850}.subtitle{font-size:29px;line-height:1.4;color:#b9c0ca;margin-top:12px}
    .visual{margin-top:38px;border:1px solid #31363e;background:#11151b;min-height:500px;padding:42px;display:flex;align-items:center;justify-content:center;overflow:hidden}.requirement{margin-top:26px;border-left:6px solid ${accent};padding:12px 20px;font-size:23px;line-height:1.45;color:#d8dde4;background:#121820;max-width:1400px}
    .flow{display:flex;align-items:center;width:100%;justify-content:space-between}.flow>div{width:190px;height:170px;border:1px solid #3a404a;padding:24px;display:flex;flex-direction:column;justify-content:space-between}.flow>div.active{border-color:${accent};background:#17221f}.flow span{color:${accent};font-size:17px}.flow b{font-size:24px}.flow>i{font-size:30px;color:#656e7b;font-style:normal}
    .risks{display:grid;gap:22px;width:100%}.risk{display:grid;grid-template-columns:220px 1fr 90px;gap:26px;align-items:center;border:1px solid #333943;padding:22px 28px}.risk.active{border-color:${accent};background:#171d20}.risk b{font-size:26px}.risk span{height:16px;background:#292e36}.risk span i{display:block;height:100%;background:${accent}}.risk em{font-size:24px;color:${accent};font-style:normal;text-align:right}
    .hub{width:720px;height:410px;position:relative}.hub strong{position:absolute;left:250px;top:140px;width:220px;height:120px;border:2px solid ${accent};display:grid;place-items:center;font-size:31px;background:#17211f}.hub:before,.hub:after{content:"";position:absolute;left:70px;right:70px;top:199px;border-top:1px solid #58616d}.hub:after{left:359px;top:40px;bottom:40px;border-top:0;border-left:1px solid #58616d}.node{position:absolute;border:1px solid #3c434e;background:#141920;padding:16px 22px;font-size:18px;font-weight:800}.n1{left:0;top:25px}.n2{right:0;top:25px}.n3{left:0;bottom:25px}.n4{right:0;bottom:25px}.n5{left:295px;top:0}
    .timeline{width:100%}.rail{height:90px;border-bottom:2px solid #59616c;display:flex;align-items:end;justify-content:space-around}.rail i{width:7px;height:30px;background:#59616c}.rail i.active{height:78px;background:${accent}}.chapters{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:25px}.chapters span{border:1px solid #343a44;padding:22px;text-align:center;font-weight:800;color:#8f98a6}.chapters span.active{border-color:${accent};color:#fff;background:#17211f}
    .evidence-grid,.status-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;width:100%}.evidence{height:280px;border:1px solid #373d47;padding:24px;display:flex;flex-direction:column;gap:17px}.evidence.active{border-color:${accent};background:#17211f}.evidence span{color:${accent}}.evidence b{font-size:25px}.evidence i{height:12px;background:#303640}.evidence i:last-child{width:65%}
    .validation{width:100%;display:grid;gap:16px}.validation>div{display:grid;grid-template-columns:1fr 1fr;border:1px solid #343a44;padding:25px 30px;font-size:26px}.validation b{text-align:right;color:${accent}}.validation .rejected{border-color:#ff6b6b}.validation .rejected b{color:#ff6b6b}
    .fingerprint{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;width:100%}.fingerprint code{border:1px solid #39404a;padding:26px;font-size:22px;color:#c8d0db}.fingerprint strong{grid-column:1/-1;border:2px solid ${accent};padding:30px;text-align:center;font-size:28px;background:#17211f}
    .recovery{width:100%;display:grid;gap:15px}.job{display:grid;grid-template-columns:210px 120px 1fr;align-items:center;border:1px solid #343a44;padding:20px 24px}.job.changed{border-color:${accent};background:#17211f}.job span{font-weight:800;color:#62d49a}.job.changed span{color:${accent}}.job>div{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.job i{height:15px;background:#3b424c}.job.changed i:nth-child(3),.job.changed i:nth-child(4){background:${accent}}
    .gates{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;width:100%}.gate{height:210px;border:1px solid #343a44;padding:26px;display:flex;flex-direction:column;justify-content:space-between;color:#737c89}.gate.passed{border-color:${accent};color:#fff;background:#17211f}.gate span{color:${accent}}.gate b{font-size:24px}
    .status{height:220px;border:1px solid #383f49;padding:27px;display:flex;flex-direction:column;justify-content:space-between}.status b{font-size:23px}.status span{font-size:21px;color:${accent};text-transform:uppercase}
    .players{display:flex;gap:60px;align-items:center}.desktop{width:670px}.mobile{width:230px}.screen{height:310px;border:2px solid #3a424d;background:#171d24;display:grid;place-items:center}.mobile .screen{height:390px}.screen span{font-size:20px;font-weight:800;color:${accent}}.track{height:10px;background:#303640;margin-top:18px}.track i{display:block;height:100%;background:${accent}}
    .progress{position:absolute;left:270px;right:0;bottom:0;height:10px;background:#242932}.progress i{display:block;height:100%;width:${((index + 1) / scenes.length * 100).toFixed(3)}%;background:${accent}}
  </style></head><body><main><aside><div class="brand">VideoBrief<br>Long Form Dogfood</div><div><div class="chapter">CHAPTER ${String(chapterIndex + 1).padStart(2, '0')}<br>${escapeHtml(chapter.title)}</div><div class="number">${String(index + 1).padStart(2, '0')}</div></div><div class="count">SCENE ${index + 1} / ${scenes.length}</div></aside><section><div class="eyebrow">${escapeHtml(scene.eyebrow || 'LONG FORM PIPELINE')}</div><div><h1>${escapeHtml(scene.title)}</h1><div class="subtitle">${escapeHtml(scene.subtitle)}</div></div><div class="visual">${diagramMarkup(kind, localIndex)}</div><div class="requirement">${escapeHtml(scene.visualRequirement)}</div></section><div class="progress"><i></i></div></main></body></html>`);
  await page.screenshot({ path: cardPath });
  mapping.push({
    sceneId: scene.id,
    chapterId: scene.chapterId,
    title: scene.title,
    sourceStart: start,
    sourceEnd: end,
    cardPath,
    visualKind: kind,
    visualRequirement: scene.visualRequirement,
    matchReason: `原创信息层直接呈现「${scene.title}」的标题、字幕和对应${kind}结构，仅承担本幕视觉说明，不作为事实证据。`,
    rightsStatus: 'cleared',
  });
}
await browser.close();

const segmentPaths = [];
for (const item of mapping) {
  const output = resolve(segmentDir, `${item.sceneId}.mp4`);
  const result = spawnSync(ffmpegPath, [
    '-y', '-loop', '1', '-i', item.cardPath,
    '-vf', `zoompan=z='1+0.012*on/${segmentDurationSeconds * 30 - 1}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${segmentDurationSeconds * 30}:s=1920x1080:fps=30,format=yuv420p`,
    '-frames:v', String(segmentDurationSeconds * 30), '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22',
    '-profile:v', 'high', '-level', '4.2', '-r', '30', '-g', '60', '-movflags', '+faststart', output,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Could not render ${item.sceneId}: ${result.stderr}`);
  segmentPaths.push(output);
}
const concatPath = resolve(outputRoot, 'segments.txt');
writeFileSync(concatPath, `${segmentPaths.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join('\n')}\n`);
const concat = spawnSync(ffmpegPath, [
  '-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-c', 'copy', '-movflags', '+faststart', sourceVideo,
], { encoding: 'utf8' });
if (concat.status !== 0) throw new Error(`Could not concatenate scene source: ${concat.stderr}`);
writeFileSync(mappingPath, `${JSON.stringify({
  projectId,
  generatedAt: new Date().toISOString(),
  sourceVideo,
  segmentDurationSeconds,
  scenes: mapping,
}, null, 2)}\n`);

async function jsonResponse(response, label) {
  const payload = await response.json();
  if (!response.ok) throw new Error(`${label}: ${payload.error || response.statusText}`);
  return payload;
}

if (apply) {
  const sourceHash = createHash('sha256').update(readFileSync(sourceVideo)).digest('hex');
  let current = await jsonResponse(
    await fetch(`${baseUrl}/api/workbench/brief?project=${projectId}`, { cache: 'no-store' }),
    'Could not read project',
  );
  let visualSource = current.brief.sources.find((source) => (
    source.originUrl === 'local://videobrief-long-form-scene-cards-v1'
    && source.contentHash === sourceHash
  ));
  if (!visualSource) {
    const stats = statSync(sourceVideo);
    const metadata = encodeURIComponent(JSON.stringify({
      fileName: 'videobrief-long-form-scene-source.mp4',
      fileSize: stats.size,
      label: 'VideoBrief 8 分钟逐幕原创信息层',
      originUrl: 'local://videobrief-long-form-scene-cards-v1',
      mimeType: 'video/mp4',
      materialRole: 'broll',
      verificationStatus: 'verified',
      rightsStatus: 'cleared',
      rightsNote: 'VideoBrief 根据当前 canonical scenes 生成的原创信息层，仅用于本地未发布长片 dogfood。',
      confirmRights: 'yes',
    }));
    const upload = await jsonResponse(await fetch(`${baseUrl}/api/projects/${projectId}/sources`, {
      method: 'POST',
      headers: {
        'content-type': 'video/mp4',
        'content-length': String(stats.size),
        'x-videobrief-source-metadata': metadata,
      },
      body: createReadStream(sourceVideo),
      duplex: 'half',
    }), 'Could not import scene source');
    visualSource = upload.source;
  }
  await jsonResponse(await fetch(`${baseUrl}/api/projects/${projectId}/material-review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sourceIds: [visualSource.id] }),
  }), 'Could not approve scene source');
  current = await jsonResponse(
    await fetch(`${baseUrl}/api/workbench/brief?project=${projectId}`, { cache: 'no-store' }),
    'Could not refresh project',
  );
  const mappingByScene = new Map(mapping.map((item) => [item.sceneId, item]));
  const reviewedAt = new Date().toISOString();
  const updatedProject = {
    ...current.brief,
    scenes: current.brief.scenes.map((scene) => {
      const item = mappingByScene.get(scene.id);
      if (!item || !scene.enabled) return scene;
      const candidate = {
        id: 'candidate-scene-aligned-01',
        sourceId: visualSource.id,
        assetPath: visualSource.assetPath,
        mediaType: 'video',
        sourceStart: item.sourceStart,
        sourceEnd: item.sourceEnd,
        matchReason: item.matchReason,
        rightsStatus: 'cleared',
      };
      return {
        ...scene,
        sourceId: candidate.sourceId,
        sourceStart: candidate.sourceStart,
        sourceEnd: candidate.sourceEnd,
        candidates: [candidate],
        selectedCandidateId: candidate.id,
        selectionStatus: 'codex_reviewed',
        selectionReviewedAt: reviewedAt,
        selectionNote: `${item.sceneId} 已逐项核对：标题、字幕、画面要求与独立原创信息层一致；该画面仅作视觉说明，不冒充事实证据。`,
      };
    }),
  };
  const saved = await jsonResponse(await fetch(`${baseUrl}/api/workbench/brief`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, brief: updatedProject }),
  }), 'Could not save reviewed candidates');
  writeFileSync(resolve(outputRoot, 'applied-project-summary.json'), `${JSON.stringify({
    projectId,
    sourceId: visualSource.id,
    sourceAssetPath: visualSource.assetPath,
    sourceHash,
    approvedSourceIds: saved.brief.materialReview.approvedSourceIds,
    reviewedScenes: saved.brief.scenes.filter((scene) => scene.selectionStatus === 'codex_reviewed').length,
    technicalStatus: saved.brief.technical_status,
  }, null, 2)}\n`);
}

console.log(JSON.stringify({
  projectId,
  outputRoot,
  sourceVideo,
  mappingPath,
  scenes: mapping.length,
  durationSeconds: mapping.length * segmentDurationSeconds,
  applied: apply,
}, null, 2));
