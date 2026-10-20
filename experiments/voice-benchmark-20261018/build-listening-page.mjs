#!/usr/bin/env node
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const workspace = await fs.realpath(process.cwd());
const statusNames = { generated: '已生成，待试听', blocked: '暂未生成', historical: '历史本地生成，文稿不同', 'official-demo': '官方示例，文稿不同；未在本站调用生成' };
const officialDomains = [
  'aliyun.com', 'aliyuncs.com', 'alibabacloud.com', 'modelscope.cn',
  'google.dev', 'google.com', 'googleapis.com', 'volcengine.com', 'volces.com', 'portal.volccdn.com',
  'microsoft.com', 'azure.com', 'elevenlabs.io', 'qwen.ai', 'qwenlm.github.io',
  'github.com', 'huggingface.co', 'fish.audio', 'fishaudio.github.io',
  'openai.com', 'cosyvoice.github.io', 'fun-audio-llm.github.io', 'funaudiollm.github.io',
];

function fail(message) { throw new Error(message); }
function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}
function string(value, field, optional = false) {
  if (optional && (value === undefined || value === null)) return '';
  if (optional && typeof value === 'string' && !value.trim()) return '';
  if (typeof value !== 'string' || !value.trim()) fail(`${field} 必须为非空文本`);
  return value.trim();
}
function escaped(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
function officialUrl(value, field) {
  if (!value) return '';
  let url;
  try { url = new URL(string(value, field)); } catch { fail(`${field} 不是有效网址`); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) fail(`${field} 只能使用无凭证的 HTTP/HTTPS 官方链接`);
  if (!officialDomains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) fail(`${field} 不在已知官方域名列表内`);
  if ([...url.searchParams.keys()].some(key => /(?:key|token|secret|authorization|password|credential|signature)/i.test(key))) fail(`${field} 不得包含凭证参数`);
  return url.href;
}
async function noSymlinks(target) {
  if (!inside(workspace, target)) fail('路径必须位于当前工作区内');
  let current = workspace;
  for (const segment of path.relative(workspace, target).split(path.sep)) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) fail(`拒绝符号链接路径：${path.relative(workspace, current)}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
async function newDestination(value, allowed, field) {
  const target = path.resolve(workspace, string(value, field));
  if (!inside(allowed, target)) fail(`${field} 必须为 ${path.relative(workspace, allowed)}/ 下的新目录`);
  await noSymlinks(target);
  try { await fs.lstat(target); fail(`${field} 已存在，禁止覆盖：${path.relative(workspace, target)}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return target;
}
async function readAudio(row, index) {
  const preferred = row.normalizedAudioPath ? 'normalizedAudioPath' : 'audioPath';
  if (!row[preferred]) {
    if (row.status === 'generated') fail(`rows[${index}] 已生成但缺少音频`);
    return null;
  }
  const audioPath = path.resolve(workspace, string(row[preferred], `rows[${index}].${preferred}`));
  const outputRoot = path.join(workspace, 'output');
  if (!inside(outputRoot, audioPath)) fail(`rows[${index}] 音频必须位于工作区 output/ 下`);
  await noSymlinks(audioPath);
  const resolvedPath = await fs.realpath(audioPath);
  if (!inside(outputRoot, resolvedPath)) fail(`rows[${index}] 音频实际路径越界`);
  const stat = await fs.stat(resolvedPath);
  if (!stat.isFile() || stat.size === 0) fail(`rows[${index}] 音频不是非空普通文件`);
  const extension = path.extname(resolvedPath).toLowerCase();
  if (!['.wav', '.mp3', '.m4a', '.ogg', '.opus', '.flac', '.aac', '.mp4'].includes(extension)) fail(`rows[${index}] 音频扩展名不受支持`);
  const hashField = preferred === 'normalizedAudioPath' ? 'normalizedSha256' : 'audioSha256';
  const expected = string(row[hashField], `rows[${index}].${hashField}`).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) fail(`rows[${index}] SHA-256 格式错误`);
  const actual = createHash('sha256').update(await fs.readFile(resolvedPath)).digest('hex');
  if (actual !== expected) fail(`rows[${index}] 音频 SHA-256 不匹配`);
  return { source: resolvedPath, file: `sample-${String(index + 1).padStart(2, '0')}${extension}`, sha256: actual, bytes: stat.size, normalized: preferred === 'normalizedAudioPath' };
}

function render(manifest, rows) {
  const summary = `${rows.filter(row => row.status === 'generated').length} 条本轮同稿 · ${rows.filter(row => row.status === 'historical').length} 条历史对照 · ${rows.filter(row => row.status === 'official-demo' && (row.audio || row.demoAudioUrl)).length} 条官方样音`;
  function rowHtml(row, index) {
    const number = String(index + 1).padStart(2, '0');
    const audioSource = row.audio ? `audio/${row.audio.file}` : row.demoAudioUrl;
    const playable = audioSource ? `<audio controls preload="none" src="${escaped(audioSource)}" aria-label="试听方案 ${number}"></audio><small>${row.durationSeconds ? `${row.durationSeconds.toFixed(1)} 秒 · ` : ''}${row.audio ? row.audio.normalized ? '已统一响度' : '原始音量' : '官方原站在线播放 · 音量未统一'} · 默认 1 倍速</small>` : '<span class="unavailable">暂无可播放音频</span>';
    const link = row.sourceUrl ? `<a class="identity" href="${escaped(row.sourceUrl)}" target="_blank" rel="noopener noreferrer">官方入口 ↗</a>` : '';
    const rowScript = row.text && row.text !== manifest.text ? `<details class="row-script"><summary>查看此段文稿</summary><p>${escaped(row.text)}</p></details>` : '';
    return `<tr data-id="${escaped(row.id)}"><th scope="row"><span class="number">${number}</span><span class="blind-name">方案 ${number}</span><span class="identity provider">${escaped(row.provider)}</span></th><td data-label="模型 / 声线"><span class="identity">${escaped(row.model)}<br><span class="muted">${escaped(row.voice)}</span></span><span class="blind-only">身份已隐藏</span><small>${escaped(row.language)}</small></td><td data-label="试听">${playable}</td><td data-label="文稿 / 状态"><span class="badge ${row.status === 'generated' ? 'ready' : ''}">${row.status === 'generated' ? '同稿实测' : row.status === 'historical' ? '历史不同稿' : row.status === 'official-demo' ? '官方不同稿' : '未生成'}</span><p>${escaped(statusNames[row.status])}</p>${row.reason ? `<small>${escaped(row.reason)}</small>` : ''}${rowScript}${link}</td><td data-label="费用"><span>${escaped(row.costNote || '实际费用未知')}</span></td><td data-label="我的感受"><div class="feedback">${[['favorite', '喜欢'], ['natural', '像真人'], ['pauses', '停顿舒服'], ['mandarin', '普通话自然']].map(([key, label]) => `<label><input type="checkbox" data-feedback="${key}" ${!audioSource ? 'disabled' : ''}>${label}</label>`).join('')}<input class="note" aria-label="方案 ${number} 备注" type="text" maxlength="240" placeholder="补充感受（可选）" ${!audioSource ? 'disabled' : ''}></div></td></tr>`;
  }
  const groups = [
    { status: 'generated', title: '本轮同稿实测', note: '以下使用顶部同一段中文文稿，可直接对比。' },
    { status: 'historical', title: '历史本地试听', note: '这些音频来自旧项目，文稿不同；用于回顾原有音色，不与本轮同稿混合排名。' },
    { status: 'official-demo', title: '官方不同稿示例', note: '仅用于初筛音色。未在本站调用生成；远程音频由官方原站播放，网络不可用时可打开官方入口。' },
    { status: 'blocked', title: '尚未取得音频', note: '保留本次真实阻塞原因，不代表这些方案听感差。' },
  ];
  const tables = groups.filter(group => rows.some(row => row.status === group.status)).map(group => `<section><h2>${group.title}</h2><p class="section-note">${group.note}</p><div class="table-wrap"><table><thead><tr><th>序号 / 方案</th><th>实际模型 / 声线</th><th>点击试听</th><th>文稿 / 实际状态</th><th>实际或未知费用</th><th>我的感受</th></tr></thead><tbody>${rows.map((row, index) => row.status === group.status ? rowHtml(row, index) : '').join('\n')}</tbody></table></div></section>`).join('\n');
  const mediaOrigins = [...new Set(rows.filter(row => row.demoAudioUrl).map(row => new URL(row.demoAudioUrl).origin))].join(' ');
  const safeJson = JSON.stringify({ title: manifest.title, generatedAt: manifest.generatedAt, rows: rows.map(({ id, provider, model, voice, status }, index) => ({ id, number: index + 1, provider, model, voice, status })) }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src 'self' ${escaped(mediaOrigins)}; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>${escaped(manifest.title)}</title><style>
:root{color-scheme:light;--ink:#182329;--muted:#607079;--line:#dbe3e5;--paper:#f6f8f8;--accent:#155e54}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}main{max-width:1500px;margin:0 auto;padding:32px 24px 64px}h1{font-size:26px;line-height:1.35;margin:0 0 10px}p{margin:4px 0 8px}.lead{max-width:850px;color:var(--muted)}.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:22px 0 14px}button{font:inherit;background:white;border:1px solid #adc0bf;border-radius:7px;padding:8px 13px;color:var(--accent);cursor:pointer}button:hover{background:#eaf2ef}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #6cbaac;outline-offset:3px}.toolbar small{color:var(--muted)}details{border:1px solid var(--line);border-radius:8px;background:white;padding:12px 16px;margin:18px 0}summary{cursor:pointer;font-weight:600}.script{max-width:920px;white-space:pre-wrap;margin:12px 0 8px}.direction{font-size:13px;color:var(--muted);white-space:pre-wrap}table{width:100%;border-collapse:collapse;background:white;border:1px solid var(--line);font-size:14px}thead{text-align:left;background:#edf1f1}th,td{padding:15px 12px;border-bottom:1px solid var(--line);vertical-align:top}th[scope=row]{text-align:left;width:145px}.number{display:block;font-size:23px;line-height:1.2;font-variant-numeric:tabular-nums;color:var(--accent);margin-bottom:7px}.provider{display:block}td:nth-child(2){min-width:145px;max-width:220px;overflow-wrap:anywhere}td:nth-child(3){min-width:235px}td:nth-child(4){min-width:170px;max-width:280px}td:nth-child(5){min-width:120px;max-width:180px}td:nth-child(6){min-width:170px}audio{display:block;width:230px;max-width:100%;height:38px}small{display:block;font-size:12px;color:var(--muted);margin-top:7px;overflow-wrap:anywhere}.muted,.unavailable{color:var(--muted)}.badge{display:inline-block;background:#edf0f0;color:#58666b;border-radius:4px;padding:2px 7px;font-size:12px}.badge.ready{background:#e3f1e9;color:#176345}a{display:inline-block;color:var(--accent);margin-top:8px;text-underline-offset:3px}.feedback{display:grid;gap:5px}.feedback label{display:flex;gap:7px;align-items:center;white-space:nowrap;font-size:13px}input[type=checkbox]{width:16px;height:16px;accent-color:var(--accent);margin:0}.note{min-width:0;width:155px;border:1px solid var(--line);border-radius:4px;padding:7px;font:inherit;font-size:12px;margin-top:5px}.blind-name,.blind-only{display:none}.anonymous .identity{display:none}.anonymous .blind-name,.anonymous .blind-only{display:block}.foot{margin-top:18px;max-width:940px;font-size:13px;color:var(--muted)}.notice{min-height:22px;color:var(--accent);font-size:13px}
h2{font-size:19px;margin:28px 0 5px}.section-note{font-size:13px;color:var(--muted);margin-bottom:12px}.row-script{padding:7px 8px;margin:9px 0;font-size:12px}.row-script p{white-space:pre-wrap;max-height:160px;overflow:auto}
@media(max-width:1100px) and (min-width:721px){.table-wrap{overflow-x:auto}table{min-width:1050px}}@media(max-width:720px){main{padding:22px 14px 42px}h1{font-size:23px}.toolbar{align-items:flex-start}.toolbar small{flex-basis:100%}table,tbody{display:block;border:0;background:none}thead{display:none}tr{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;background:white;border:1px solid var(--line);border-radius:9px;padding:15px;margin-bottom:14px}th,td{display:block;padding:0;border:0;min-width:0!important;max-width:none!important}th[scope=row]{width:auto}.number{display:inline-block;margin:0 9px 4px 0}.provider,.blind-name{font-size:16px}td:nth-child(2){text-align:right}td:nth-child(3),td:nth-child(4),td:nth-child(5),td:nth-child(6){grid-column:1/-1}td:nth-child(3){padding:8px 0}audio{width:100%;height:42px}td:nth-child(5):before{content:'费用：';color:var(--muted)}.feedback{display:flex;flex-wrap:wrap;gap:11px 14px;border-top:1px solid var(--line);padding-top:14px}.note{width:100%}small{margin-top:4px}.badge{margin-right:5px}td:nth-child(4)>p{display:inline;font-size:13px}.foot{font-size:12px}}
</style></head><body><main><h1>${escaped(manifest.title)}</h1><p class="lead">先听声音，再看方案。所有人声均为 AI 合成；目前没有预设排名，待你比较自然度、停顿和中文听感。</p><p class="lead">${escaped(summary)}。先听 01–04，再挑喜欢的声线。</p><details open><summary>同稿实测的固定文稿</summary><p class="script">${escaped(manifest.text)}</p><p class="direction">试听希望达到的表达方向（各方案实际控制见表中说明）：${escaped(manifest.style)}</p></details><div class="toolbar"><button id="anonymous" type="button" aria-pressed="false">开启匿名试听</button><button id="download" type="button">下载我的评价</button><small>播放一个会自动暂停其他。评价只保存在当前浏览器；远程样音播放会向对应官方站点请求音频。</small></div><p class="notice" id="notice" role="status"></p>${tables}<p class="foot">“同稿实测”才适合直接比较同一内容的表达。历史音频和官方不同稿只能用来初筛音色，不能与同稿样本做公平排名。暂无音频的方案保留原因和官方入口，不代表听感差。原始音量和统一响度已分别标明；比较时请保持播放器 1 倍速与设备音量一致。</p><p class="foot">整理时间：${escaped(manifest.generatedAt)}。勾选和备注是你的主观评价，不代表平台留存或生产稳定性已经验证。</p></main><script id="listening-data" type="application/json">${safeJson}</script><script>
const data=JSON.parse(document.getElementById('listening-data').textContent);const storageKey='videobrief.voice-benchmark.v1.'+data.generatedAt;const notice=document.getElementById('notice');let saved={};let storageAvailable=true;try{const parsed=JSON.parse(localStorage.getItem(storageKey)||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))saved=parsed;}catch{storageAvailable=false;notice.textContent='浏览器未允许本地保存；仍可试听并下载本次评价。';}
document.querySelectorAll('audio').forEach(player=>{player.playbackRate=1;player.addEventListener('play',()=>document.querySelectorAll('audio').forEach(other=>{if(other!==player)other.pause();}));player.addEventListener('error',()=>{player.insertAdjacentHTML('afterend','<small>音频暂不可播放，请尝试官方入口或稍后重试。</small>');});});
function persist(){if(!storageAvailable)return;try{localStorage.setItem(storageKey,JSON.stringify(saved));}catch{storageAvailable=false;notice.textContent='本地保存不可用，请下载评价以保留。';}}
document.querySelectorAll('tr[data-id]').forEach(row=>{const id=row.dataset.id;const value=saved[id]&&typeof saved[id]==='object'?saved[id]:{};row.querySelectorAll('[data-feedback]').forEach(input=>{input.checked=value[input.dataset.feedback]===true;input.addEventListener('change',()=>{saved[id]={...saved[id],[input.dataset.feedback]:input.checked};persist();});});const note=row.querySelector('.note');note.value=typeof value.note==='string'?value.note.slice(0,240):'';note.addEventListener('input',()=>{saved[id]={...saved[id],note:note.value};persist();});});
document.getElementById('anonymous').addEventListener('click',event=>{const active=document.body.classList.toggle('anonymous');event.currentTarget.setAttribute('aria-pressed',String(active));event.currentTarget.textContent=active?'显示方案名称':'开启匿名试听';});
document.getElementById('download').addEventListener('click',()=>{const result={schemaVersion:1,title:data.title,benchmarkGeneratedAt:data.generatedAt,reviewedAt:new Date().toISOString(),rows:data.rows.map(row=>({...row,feedback:{favorite:saved[row.id]?.favorite===true,natural:saved[row.id]?.natural===true,pauses:saved[row.id]?.pauses===true,mandarin:saved[row.id]?.mandarin===true,note:typeof saved[row.id]?.note==='string'?saved[row.id].note.slice(0,240):''}}))};const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='我的语音试听评价.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notice.textContent='评价已导出，仅保存在本机。';});
</script></body></html>`;
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('用法：node experiments/voice-benchmark-20261018/build-listening-page.mjs --manifest=output/voice-benchmark-20261018/manifest.json --output=output/voice-benchmark-20261018/listening --public=public/renders/voice-benchmark-20261018/');
    return;
  }
  const argumentsMap = new Map();
  for (const argument of process.argv.slice(2)) {
    const match = /^--(manifest|output|public)=(.+)$/.exec(argument);
    if (!match || argumentsMap.has(match[1])) fail(`未知或重复参数：${argument}`);
    argumentsMap.set(match[1], match[2]);
  }
  const manifestPath = path.resolve(workspace, string(argumentsMap.get('manifest'), '--manifest'));
  if (!inside(path.join(workspace, 'output'), manifestPath)) fail('manifest 必须位于工作区 output/ 下');
  await noSymlinks(manifestPath);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1) fail('仅支持 manifest schemaVersion=1');
  for (const field of ['title', 'text', 'style', 'generatedAt']) manifest[field] = string(manifest[field], field);
  if (Number.isNaN(Date.parse(manifest.generatedAt))) fail('generatedAt 必须为有效日期');
  if (!Array.isArray(manifest.rows) || manifest.rows.length === 0 || manifest.rows.length > 100) fail('rows 必须包含 1 至 100 个方案');
  const outputDirectory = await newDestination(argumentsMap.get('output'), path.join(workspace, 'output'), '--output');
  const publicDirectory = await newDestination(argumentsMap.get('public'), path.join(workspace, 'public', 'renders'), '--public');
  const ids = new Set();
  const rows = [];
  for (const [index, row] of manifest.rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail(`rows[${index}] 必须为对象`);
    const id = string(row.id, `rows[${index}].id`);
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id)) fail(`rows[${index}].id 不安全`);
    if (ids.has(id)) fail(`重复方案 id：${id}`);
    ids.add(id);
    if (!Object.hasOwn(statusNames, row.status)) fail(`rows[${index}].status 不受支持`);
    const normalized = { id, status: row.group === 'historical' ? 'historical' : row.status };
    for (const field of ['provider', 'model', 'voice', 'language']) normalized[field] = string(row[field], `rows[${index}].${field}`);
    for (const field of ['reason', 'costNote', 'text']) normalized[field] = string(row[field], `rows[${index}].${field}`, true);
    if (row.status === 'blocked' && !normalized.reason) fail(`rows[${index}] 未生成方案必须说明原因`);
    if (normalized.status === 'historical' && !normalized.text) fail(`rows[${index}] 历史音频必须提供实际文稿 text`);
    if (normalized.status === 'generated' && normalized.text && normalized.text !== manifest.text) fail(`rows[${index}] 同稿实测 text 必须与总文稿一致`);
    normalized.sourceUrl = officialUrl(row.sourceUrl, `rows[${index}].sourceUrl`);
    normalized.demoAudioUrl = officialUrl(row.demoAudioUrl, `rows[${index}].demoAudioUrl`);
    if (normalized.demoAudioUrl && (!normalized.demoAudioUrl.startsWith('https://') || normalized.status !== 'official-demo')) fail(`rows[${index}] 远程样音仅支持官方不同稿 HTTPS 示例`);
    if (['blocked', 'official-demo'].includes(normalized.status) && !normalized.sourceUrl) fail(`rows[${index}] 未生成或官方示例必须有官方入口`);
    if (row.durationSeconds !== undefined && (!Number.isFinite(row.durationSeconds) || row.durationSeconds <= 0)) fail(`rows[${index}].durationSeconds 必须为正数`);
    normalized.durationSeconds = row.durationSeconds;
    normalized.audio = normalized.status === 'blocked' ? null : await readAudio({ ...row, status: normalized.status }, index);
    if (normalized.status === 'historical' && !normalized.audio) fail(`rows[${index}] 历史本地音频缺少文件`);
    if (normalized.audio && normalized.demoAudioUrl) fail(`rows[${index}] 不得同时设置本地和远程样音`);
    rows.push(normalized);
  }
  const html = render(manifest, rows);
  const receipt = { schemaVersion: 1, title: manifest.title, text: manifest.text, style: manifest.style, generatedAt: manifest.generatedAt, builtAt: new Date().toISOString(), rows: rows.map(({ audio, ...row }) => ({ ...row, ...(audio ? { audioPath: `audio/${audio.file}`, audioSha256: audio.sha256, audioBytes: audio.bytes, loudnessNormalized: audio.normalized } : {}) })) };
  for (const destination of [outputDirectory, publicDirectory]) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.mkdir(destination);
    await fs.mkdir(path.join(destination, 'audio'));
    for (const row of rows) if (row.audio) await fs.copyFile(row.audio.source, path.join(destination, 'audio', row.audio.file), constants.COPYFILE_EXCL);
    await fs.writeFile(path.join(destination, 'index.html'), html, { flag: 'wx' });
    await fs.writeFile(path.join(destination, 'listening-manifest.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  }
  console.log(JSON.stringify({ output: path.relative(workspace, outputDirectory), public: path.relative(workspace, publicDirectory), rows: rows.length, playable: rows.filter(row => row.audio || row.demoAudioUrl).length, localAudio: rows.filter(row => row.audio).length, remoteOfficialAudio: rows.filter(row => row.demoAudioUrl).length, blocked: rows.filter(row => row.status === 'blocked').length }, null, 2));
}

main().catch(error => { console.error(`试听页未生成：${error.message}`); process.exitCode = 1; });
