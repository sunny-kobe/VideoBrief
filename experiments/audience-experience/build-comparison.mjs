import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { buildCreativeShotInput, creativeShotFingerprint, safeWorkspacePath } from '../../scripts/lib/creative-shot.mjs';
import { productionContentFingerprint } from '../../scripts/lib/production-content-fingerprint.mjs';
import { resolveVoiceoverConfig, voiceoverCacheKey } from '../../src/voiceoverProvider.mjs';

// Local, explicit experiment only: no provider calls, canonical changes or production approvals.
const root = process.cwd();
const arguments_ = process.argv.slice(2);
const options = new Map();
for (const arg of arguments_) {
  const match = /^--(audition|take)=(.+)$/.exec(arg);
  if (!match || options.has(match[1])) throw new Error('Optional arguments: --take=<new-name> --audition=output/voice-auditions/<take>/receipt.json');
  options.set(match[1], match[2]);
}
if (options.has('take') && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(options.get('take'))) throw new Error('Take must be a safe single directory name.');
const suffix = options.has('take') ? `-${options.get('take')}` : '';
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const textHash = (text) => createHash('sha256').update(text).digest('hex');
const output = safeWorkspacePath(root, `output/audience-reviews/comparison-20261017${suffix}`, { output: true });
const publicDir = safeWorkspacePath(root, `public/renders/audience-review-20261017${suffix}`);
if (existsSync(output) || existsSync(publicDir)) throw new Error('Comparison already exists; preserve this take and select a new one.');
const wingId = 'wing-flex-flutter-explainer-20261013';
const manifestPath = resolve(`output/videos/${wingId}-work/render-manifest.json`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const project = JSON.parse(readFileSync(resolve(`content/projects/${wingId}/project.json`), 'utf8'));
if (manifest.projectId !== wingId || manifest.productionContentFingerprint !== productionContentFingerprint(project)) throw new Error('Source manifest is stale.');
const timeline = JSON.parse(readFileSync(manifest.artifacts.timeline, 'utf8'));
const scene = timeline.scenes.find((item) => item.id === 'scene-04');
const canonicalScene = project.scenes.find((item) => item.id === 'scene-04');
const previewDir = resolve('output/creative-shots/audience-experience-20261017/wing/take-01');
const preview = JSON.parse(readFileSync(resolve(previewDir, 'render-receipt.json'), 'utf8'));
const previewClip = resolve(previewDir, 'clip.mp4');
if (!scene || Math.abs(scene.duration - 9.3) > 0.001 || !preview.technical.decodePassed
  || preview.projectId !== wingId || preview.sceneId !== scene.id
  || preview.spec.width !== 1920 || preview.spec.height !== 1080 || preview.spec.fps !== 30 || preview.spec.durationInFrames !== 279
  || preview.inputFingerprint !== creativeShotFingerprint(buildCreativeShotInput(project, scene.id, 9.3))
  || preview.entrySha256 !== hash(safeWorkspacePath(root, preview.entry, { mustExist: true }))
  || preview.artifacts.find((item) => item.path === 'clip.mp4')?.sha256 !== hash(previewClip)
  || canonicalScene.narration !== scene.narration || canonicalScene.sourceId !== scene.sourceId
  || Math.abs(canonicalScene.sourceStart - scene.sourceStart) > 0.001 || Math.abs(canonicalScene.sourceEnd - scene.sourceEnd) > 0.001) throw new Error('Expected current scene timing and hash-bound decoded preview are missing.');
const candidate = JSON.parse(readFileSync(resolve('experiments/audience-experience/heat-pump-audition.json'), 'utf8'));
const heatProject = JSON.parse(readFileSync(resolve('content/projects/cold-air-heat-pump-explainer-20261013/project.json'), 'utf8'));
const expectedVoice = resolveVoiceoverConfig(heatProject.render);
if (expectedVoice.engine !== 'edge-tts') throw new Error('This comparison expects the existing Edge voice; no alternate engine is selected.');
const auditionPath = options.has('audition') ? safeWorkspacePath(root, options.get('audition'), { mustExist: true, output: true }) : null;
const audition = auditionPath ? JSON.parse(readFileSync(auditionPath, 'utf8')) : null;
let audioFiles = [];
if (audition) {
  if (audition.status !== 'awaiting-human-listening' || audition.projectId !== heatProject.id
    || audition.projectSnapshotSha256 !== textHash(JSON.stringify(heatProject))
    || !Array.isArray(audition.variants) || audition.variants.length !== candidate.variants.length) throw new Error('Audition receipt is incomplete or stale.');
  audioFiles = candidate.variants.map((expected) => {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(expected.id)) throw new Error('Unsafe candidate id.');
    const matches = audition.variants.filter((item) => item.id === expected.id);
    const variant = matches[0];
    if (matches.length !== 1 || variant.text !== expected.text.trim() || variant.textSha256 !== textHash(expected.text.trim())
      || variant.cacheKey !== voiceoverCacheKey(expected.text.trim(), expectedVoice)
      || !variant.voice || Object.entries(expectedVoice).some(([key, value]) => JSON.stringify(variant.voice[key]) !== JSON.stringify(value))
      || variant.fullDecodePassed !== true || !Number.isFinite(variant.durationSeconds) || variant.durationSeconds <= 0) throw new Error('Audition text or voice does not match the candidate.');
    const audioPath = safeWorkspacePath(root, variant.audioPath, { mustExist: true, output: true });
    if (hash(audioPath) !== variant.audioSha256) throw new Error('Audition bytes changed.');
    return { filename: `${expected.id}.mp3`, sourcePath: audioPath, text: variant.text, durationSeconds: variant.durationSeconds, sha256: variant.audioSha256 };
  });
}
mkdirSync(output, { recursive: true });
function run(args) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-n', ...args], { cwd: output, encoding: 'utf8', timeout: 120_000 });
  if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
}
const audio = resolve(output, 'shared-narration.wav');
run(['-ss', String(scene.start), '-i', manifest.artifacts.outputVideo, '-t', '9.3', '-vn', '-c:a', 'pcm_s16le', audio]);
copyFileSync(resolve(`output/videos/${wingId}-work/scene-segments/004-scene-04.ass`), resolve(output, 'subtitles.ass'));
const before = resolve(output, 'wing-a-original.mp4');
const after = resolve(output, 'wing-b-focus.mp4');
const common = ['-map', '0:v:0', '-map', '1:a:0', '-t', '9.3', '-frames:v', '279', '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'];
run(['-ss', String(scene.start), '-i', manifest.artifacts.outputVideo, '-i', audio, ...common, before]);
run(['-i', previewClip, '-i', audio, '-vf', 'ass=subtitles.ass', ...common, after]);
for (const path of [before, after]) run(['-i', path, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-']);
for (const [path, filename] of [[before, 'wing-a.jpg'], [after, 'wing-b.jpg']]) run(['-ss', '4.6', '-i', path, '-frames:v', '1', '-q:v', '2', resolve(output, filename)]);
const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
for (const item of audioFiles) copyFileSync(item.sourcePath, resolve(output, item.filename));
const cards = candidate.variants.map((variant, index) => `<article><p class="tag">${index ? '候选 B' : '原稿 A'} · 同一 Yunxi 声线</p><h3>${index ? '先问观众关心的问题' : '先说明设备关系'}</h3><p>${escape(variant.text)}</p>${audioFiles[index] ? `<audio controls preload="metadata" src="${audioFiles[index].filename}"></audio><p class="muted">实测完整音频 ${audioFiles[index].durationSeconds.toFixed(2)} 秒；待人工听感比较。</p>` : '<p class="notice">本次 Edge 配音请求超时，没有生成可试听的新版音频。文稿只是候选，不能判定自然度。</p>'}</article>`).join('');
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VideoBrief · 观感对照</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f5f3ed;color:#183d46;font:17px/1.8 system-ui,"PingFang SC",sans-serif}main{max-width:1180px;margin:auto;padding:52px 28px 80px}h1{font-size:clamp(32px,4vw,54px);line-height:1.2;letter-spacing:-1px;margin:12px 0 24px}h2{font-size:26px;margin-top:48px}h3{font-size:21px;margin:0}p{max-width:900px}.tag{color:#a84f30;font-size:13px;font-weight:700;letter-spacing:1px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}article{background:#fff;border:1px solid #d9dfd9;border-radius:20px;padding:22px}video{width:100%;aspect-ratio:16/9;background:#102531;border-radius:12px;display:block;margin:18px 0}audio{width:100%;margin-top:16px}.muted{color:#62736f;font-size:14px}.notice{border-left:3px solid #bb633d;padding:12px 18px;background:#fff6ee;font-size:15px}li{margin:8px 0}a{color:#276f7b}footer{margin-top:46px;border-top:1px solid #d9dfd9;padding-top:20px}@media(max-width:700px){main{padding:28px 16px}.grid{grid-template-columns:1fr}article{padding:18px}h2{font-size:24px}}</style>
<main><p class="tag">VideoBrief / 2026.10.17 / 内部创作对照</p><h1>少一点讲义感，<br>让变化自己说话。</h1><p>先看两段同旁白、同字幕、同长度的机翼解释，再比较热泵的开场措辞候选。所有样片均为隔离实验，原成片和已发布版本保持原记录。</p>
<h2>01 / 画面：一次只引导一个重点</h2><p class="muted">原片 21.50–30.80 秒；两版共用从原成片提取的同一音频。改变的是机制画面及其信息出现顺序。不是物理仿真。</p>
<div class="grid"><article><p class="tag">A / 原版</p><h3>结论与标签同时出现</h3><video controls playsinline preload="metadata" poster="wing-a.jpg" src="wing-a-original.mp4"></video><p class="muted">比较阅读负担、目光落点与动作是否能帮助理解。</p></article><article><p class="tag">B / 新的视觉候选</p><h3>跟着语义展开反馈过程</h3><video controls playsinline preload="metadata" poster="wing-b.jpg" src="wing-b-focus.mp4"></video><p class="muted">保留相同声音；不预先铺满结论，只突出当前变化。</p></article></div>
<h2>02 / 声音：把观众的问题放到第一句</h2><p class="muted">A/B 均按完整连续文本试读；比较只针对措辞。它们与已发布逐幕音频的差异不能单独归因于措辞。</p><div class="grid">${cards}</div>
<h2>按这三步判断</h2><ol><li>只听：有没有朗读腔、重点和停顿是否自然？不要只检查字有没有读对。</li><li>静音看：目光知道看哪里吗？气流变化与抖动放大能看出联系吗？</li><li>合起来看：哪一秒走神或觉得机械？看完用自己的话解释一次原因。</li></ol><p class="notice">尚未取得观众偏好或留存提升证据。技术解码成功与文字减少，均不能直接判定“更自然”或“更吸引人”。</p><footer class="muted">只在本机提供预览；无数据采集、上传和自动发布。机翼原素材：NASA；B 为原创定性机制示意。热泵音频为合成声音。</footer></main></html>`;
writeFileSync(resolve(output, 'index.html'), html, { flag: 'wx' });
const receipt = { schemaVersion: 1, status: 'awaiting-human-comparison', generatedAt: new Date().toISOString(),
  sourceManifestSha256: hash(manifestPath), sourceVideoSha256: hash(manifest.artifacts.outputVideo), sharedAudioSha256: hash(audio),
  sceneId: scene.id, originalWindow: { start: scene.start, end: scene.end }, durationSeconds: 9.3,
  visualControl: 'identical narration waveform and subtitles; visual presentation differs', audioControl: 'same provider/voice/rate and continuous synthesis; wording differs',
  audioStatus: audioFiles.length ? 'awaiting-human-listening' : 'unavailable', audioFiles,
  clips: [before, after].map((path) => ({ path, sha256: hash(path), fullDecodePassed: true })),
  audiencePreference: null, formalAcceptance: 'not-performed', canonicalChanged: false };
writeFileSync(resolve(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
mkdirSync(publicDir, { recursive: true });
for (const file of ['index.html', 'wing-a-original.mp4', 'wing-b-focus.mp4', 'wing-a.jpg', 'wing-b.jpg', 'receipt.json', ...audioFiles.map((item) => item.filename)]) copyFileSync(resolve(output, file), resolve(publicDir, file));
console.log(JSON.stringify({ status: receipt.status, output, url: `http://127.0.0.1:3100/renders/audience-review-20261017${suffix}/index.html`, audioStatus: receipt.audioStatus }));
