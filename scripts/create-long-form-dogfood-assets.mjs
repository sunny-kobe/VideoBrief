import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import ffmpegPath from 'ffmpeg-static';
import { chromium } from 'playwright-core';

const outputRoot = resolve('output/long-form-dogfood-assets');
const cardDir = resolve(outputRoot, 'cards');
const segmentDir = resolve(outputRoot, 'segments');
const sourceVideo = resolve(outputRoot, 'videobrief-long-form-source.mp4');
const evidencePath = resolve(outputRoot, 'videobrief-long-form-evidence.md');
mkdirSync(cardDir, { recursive: true });
mkdirSync(segmentDir, { recursive: true });

const cards = [
  ['01', '长视频不是加长短视频', '时长增长会同时放大素材遗漏、模型超时、磁盘占用和人工审片成本。', '先改变生产合同，再增加目标时长。'],
  ['02', 'Creative Brief 先限定结果', '目标受众、平台、时长、语气、核心观点和禁止表达进入同一事实源。', '没有明确目标，不进入资料处理。'],
  ['03', 'Canonical Project 是唯一事实源', '页面、AI、渲染、proof 和导出都读取同一份 project.json。', '任何保存都会使旧成片失效。'],
  ['04', '素材导入必须流式落盘', '请求体按块写入临时文件，同时计算 SHA-256 并核对声明字节数。', '完整后原子改名，取消不留下可误用文件。'],
  ['05', '磁盘门禁分成两层', '导入前检查原素材体积；渲染前估算缓存、成片副本、音频、proof 和 ZIP。', '任务完成后仍保留至少 8 GiB。'],
  ['06', '长素材按结构切章', '超过 180 秒后，在 75–180 秒范围内优先选择场景变化和转录边界。', '章节既是理解单元，也是恢复单元。'],
  ['07', '视觉采样必须随密度变化', '稀疏章节按时长增加覆盖帧；变化密集章节额外吸收分散的 scene-change。', '单章最多 16 帧，控制模型输入。'],
  ['08', '转录和画面联合理解', '本地 Whisper 提供时间化文本，代表帧补充页面、操作和视觉状态。', '任一通道失败都必须记录 uncertainty。'],
  ['09', '章节结果可以断点续跑', 'resume key 包含素材哈希、模型、提示版本、Brief、转录和帧时间。', '输入未变化的完成章节不重复调用模型。'],
  ['10', '层级摘要不覆盖局部证据', '每章保留 facts、uncertainties、transcript 和 frame samples。', '全片摘要只负责建立章节关系。'],
  ['11', 'Evidence Unit 进入策划', '长视频不再把全部研究压缩到短视频的十二条事实上限。', '每章只能引用被分配的证据单元。'],
  ['12', '先生成全片 Outline', '结论、钩子和章节目标先确定，再逐章生成脚本。', '各章目标时长合计必须接近全片目标。'],
  ['13', '逐章生成降低失败成本', '一章失败只重试一章；已完成章节草稿持续写回 canonical project。', '取消任务时保留已完成工作。'],
  ['14', '旁白字数必须匹配时长', '每章使用最低 2.4、最高 5.2 个非空白字符每秒的预算。', 'voiceoverScript 必须等于 scenes narration。'],
  ['15', '每幕只表达一个叙事点', '建议每幕 8–20 秒，不能用少量超长静态画面填满长视频。', '章节顺序和 scene.chapterId 必须稳定。'],
  ['16', '引用不能越过章节边界', '时间引用必须落在当前 evidence unit 的 start/end 范围内。', '未知来源和越界 locator 在写入前拒绝。'],
  ['17', '候选画面限制在本章证据', '证据素材按章节窗口检索；b-roll 只能承担明确的辅助角色。', '相似项目演示不能冒充目标产品结果。'],
  ['18', '选中窗口是不可变输入', 'scene 与 candidate 的 sourceId、sourceStart、sourceEnd 必须完全一致。', '旁白过长时失败，不能静默延长或循环。'],
  ['19', '素材包先人工确认', '候选进入最终渲染前必须登记用途、核验状态和权利状态。', 'official 不等于 cleared。'],
  ['20', '长视频配音按章批处理', 'Gemini 每章生成连续口播；单章 batch 失败只对该章逐幕降级。', '短视频仍保留整片 batch。'],
  ['21', '字幕由真实音频时序派生', '先按标点和可读宽度拆句，再用检测到的静音辅助边界。', '没有静音证据时才按字符权重回退。'],
  ['22', '时间线落在整数帧网格', '每幕 frameCount 决定实际时长，累计边界由帧数派生。', '避免多幕 FFmpeg 取整产生音画漂移。'],
  ['23', '逐幕内容寻址缓存', '缓存键包含来源字节、窗口、旁白音频、时长和版式。', '中断后只补缺失或变化的幕。'],
  ['24', '最终视频无重编码拼接', '分段 MP4 使用 stream copy 合并，只统一重编码整片音频。', '减少长视频局部修改的等待成本。'],
  ['25', '队列状态必须持久化', '来源、策划和渲染任务都有 FIFO、取消、进程 PID 和死 worker 恢复。', 'Next.js 停止不应中断独立 worker。'],
  ['26', '全局锁依赖真实进程存活', '锁所有权从服务进程转移到渲染子进程，并使用随机 token 释放。', '长任务不能被固定超时误回收。'],
  ['27', 'Render Plan 绑定实际字节', '来源 SHA、逐幕命令、segment、concat list 和最终命令全部进入合同。', '任何字节或参数漂移都会使 proof 失败。'],
  ['28', 'Technical Proof 只证明文件正确', '检查完整解码、流时长、分辨率、帧率、响度、峰值、黑帧和反向转写。', '它不能替代内容语义判断。'],
  ['29', '章节指纹支持增量审片', '目标、脚本、字幕、素材窗口、来源哈希和共享渲染设置共同生成指纹。', '只复用未变化章节的逐幕语义说明。'],
  ['30', '编辑质量仍需整片复核', 'opening、可读性、节奏、字幕、发音、平台适配和 CTA 必须逐项说明。', '自动信号不能替代具体判断。'],
  ['31', '浏览器必须完整播放', '桌面和移动视口都从零开始，以一倍速、非静音顺序播放到 ended。', '最终整片播放永远不能按章节复用。'],
  ['32', '交付仍然保留四类状态', 'technical、rights、publication 和 market 独立记录。', '可播放不等于可发布，发布也不等于被市场验证。'],
];

const accents = ['#21d4a3', '#ffcc4d', '#ff6b6b', '#5bb8ff'];
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

for (const [index, card] of cards.entries()) {
  const [number, title, body, takeaway] = card;
  const accent = accents[Math.floor(index / 8) % accents.length];
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;width:1920px;height:1080px;background:#0a0d12;color:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:0;overflow:hidden}
    main{height:100%;display:grid;grid-template-columns:290px 1fr;position:relative}
    aside{border-right:1px solid #2a303a;padding:76px 54px;display:flex;flex-direction:column;justify-content:space-between;background:#0e1219}
    .brand{font-size:24px;font-weight:750;color:${accent}}.number{font-size:112px;line-height:1;font-weight:850;color:#f4f7fb}.phase{font-size:18px;color:#8c96a6;line-height:1.5}
    section{padding:108px 118px 92px;display:flex;flex-direction:column;justify-content:center;max-width:1450px}
    .eyebrow{font-size:22px;font-weight:750;color:${accent};margin-bottom:30px}h1{font-size:76px;line-height:1.14;margin:0 0 46px;max-width:1250px;font-weight:850}
    .body{font-size:35px;line-height:1.65;color:#c9d0da;max-width:1210px}.takeaway{margin-top:52px;border-left:8px solid ${accent};padding:20px 30px;font-size:31px;line-height:1.55;background:#131923;color:#fff;max-width:1180px}
    .rail{position:absolute;left:290px;right:0;bottom:0;height:12px;background:#202631}.progress{height:100%;width:${((index + 1) / cards.length * 100).toFixed(3)}%;background:${accent}}
  </style></head><body><main><aside><div class="brand">VideoBrief / Long Form</div><div class="number">${number}</div><div class="phase">Chapter ${Math.floor(index / 8) + 1}<br>${index + 1} / ${cards.length}</div></aside><section><div class="eyebrow">长视频生产合同</div><h1>${title}</h1><div class="body">${body}</div><div class="takeaway">${takeaway}</div></section><div class="rail"><div class="progress"></div></div></main></body></html>`);
  await page.screenshot({ path: resolve(cardDir, `${number}.png`) });
}
await browser.close();

if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path.');
const segmentPaths = [];
for (const [index, card] of cards.entries()) {
  const number = card[0];
  const input = resolve(cardDir, `${number}.png`);
  const output = resolve(segmentDir, `${number}.mp4`);
  const result = spawnSync(ffmpegPath, [
    '-y', '-loop', '1', '-i', input,
    '-vf', "zoompan=z='1+0.018*on/449':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=450:s=1920x1080:fps=30,format=yuv420p",
    '-frames:v', '450', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20',
    '-profile:v', 'high', '-level', '4.2', '-r', '30', '-g', '60', '-movflags', '+faststart', output,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Could not render card ${number}: ${result.stderr}`);
  segmentPaths.push(output);
}
const concatPath = resolve(outputRoot, 'segments.txt');
writeFileSync(concatPath, `${segmentPaths.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join('\n')}\n`);
const concat = spawnSync(ffmpegPath, [
  '-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-c', 'copy', '-movflags', '+faststart', sourceVideo,
], { encoding: 'utf8' });
if (concat.status !== 0) throw new Error(`Could not concatenate long source: ${concat.stderr}`);

const evidence = [
  '# VideoBrief 长视频生产线证据稿',
  '',
  '该材料由 VideoBrief 当前代码与生产合同整理，作为自有长视频 dogfood 的文字证据源。',
  '',
  ...cards.flatMap(([number, title, body, takeaway]) => [
    `## ${number}. ${title}`,
    '',
    body,
    '',
    `验收重点：${takeaway}`,
    '',
  ]),
].join('\n');
writeFileSync(evidencePath, evidence);

console.log(JSON.stringify({ outputRoot, sourceVideo, evidencePath, cards: cards.length, durationSeconds: cards.length * 15 }, null, 2));
