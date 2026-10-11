import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import {
  buildCreativeShotInput, creativeShotDependency, getCreativeShotReceiptStatus, parseCreativeShotArgs, prepareCreativeShot,
  resolvePreviewFrames, safeWorkspacePath, sha256File,
} from './lib/creative-shot.mjs';

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptPath = fileURLToPath(import.meta.url);
const args = parseCreativeShotArgs(process.argv.slice(2));

const help = `会话主导的原创镜头工作包（不修改 canonical，不调用 AI 接口）

node scripts/creative-shot.mjs prepare --brief=content/projects/<id>/project.json --scene=<scene-id> --take=take-01
node scripts/creative-shot.mjs preview --brief=... --scene=... --take=take-01 --entry=experiments/<task>/index.tsx --composition=<id>
node scripts/creative-shot.mjs render --brief=... --scene=... --take=take-01 --entry=... --composition=<id>
node scripts/creative-shot.mjs inspect --brief=... --scene=... --take=take-01

所有动作：--work-dir=output/<工作目录>（默认 output/creative-shots/<project>/<scene>）
可选：--duration=<秒>（默认 canonical 源窗口/播放速率，只改变创作目标）
preview / render：--frames=0,30,90（追加关键帧，始/中/末始终保留）
产物目录为 <work-dir>/<take>；每个 take 的预览和视频只写一次，迭代请换 take。
render 需要相同入口、输入和合成的 preview 凭证；完整静音 MP4 仍待视觉审查。
只执行工作区中由当前会话明确编写的可信入口，不能执行 API 返回或下载资料的代码。
仅使用已安装 Chrome、Remotion 和 FFmpeg；外部网络请求被拒绝，每次命令最多 10 分钟。
生成镜头须经现有素材导入、配音预检、Material Gate 和正式验收；不自动进入成片。`;

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function localNetworkUrl(value) {
  const url = new URL(value);
  return ['data:', 'blob:', 'about:'].includes(url.protocol)
    || (['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
}

function browserPath() {
  const choices = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  const found = choices.find((path) => existsSync(path));
  if (!found) throw new Error('未找到已安装的 Chrome / Chromium；工具不会自动下载浏览器。');
  return found;
}

function receiptState(receipt, input, takeDir) {
  const hashes = {};
  const dependencyHashes = {};
  let entrySha256;
  try { if (receipt.entry) entrySha256 = sha256File(safeWorkspacePath(workspaceRoot, receipt.entry, { mustExist: true })); } catch { /* Missing entry makes the receipt stale. */ }
  for (const artifact of receipt.artifacts ?? []) {
    try {
      const path = safeWorkspacePath(workspaceRoot, join(takeDir, artifact.path), { mustExist: true, output: true });
      if (relative(takeDir, path).startsWith('..')) throw new Error('产物路径越出 take。');
      hashes[artifact.path] = sha256File(path);
    } catch { /* Missing or unsafe artifacts make the receipt stale. */ }
  }
  for (const dependency of receipt.authoredDependencies ?? []) {
    try { dependencyHashes[dependency.path] = sha256File(safeWorkspacePath(workspaceRoot, dependency.path, { mustExist: true })); } catch { /* A changed dependency invalidates preview and render alike. */ }
  }
  return getCreativeShotReceiptStatus(receipt, input, entrySha256, hashes, dependencyHashes);
}

function inspect() {
  const briefPath = safeWorkspacePath(workspaceRoot, args.brief, { mustExist: true });
  const project = JSON.parse(readFileSync(briefPath, 'utf8'));
  const defaultDir = `output/creative-shots/${encodeURIComponent(project.id)}/${encodeURIComponent(args.scene)}`;
  const takeDir = safeWorkspacePath(workspaceRoot, join(args.workDir || defaultDir, args.take), { output: true });
  const receiptName = ['render-receipt.json', 'preview-receipt.json', 'prepared-receipt.json'].find((name) => existsSync(join(takeDir, name)));
  if (!receiptName) throw new Error('当前 take 没有工作包或凭证。');
  const receipt = JSON.parse(readFileSync(safeWorkspacePath(workspaceRoot, join(takeDir, receiptName), { mustExist: true }), 'utf8'));
  let result;
  try {
    const input = buildCreativeShotInput(project, args.scene, args.duration ?? receipt.durationOverride ?? undefined);
    result = receiptState(receipt, input, takeDir);
  } catch (error) {
    result = { status: 'stale', staleReasons: [error.message], semanticReview: 'not_performed' };
  }
  console.log(JSON.stringify({ takeDir, stage: receipt.stage, receipt: join(takeDir, receiptName), ...result }, null, 2));
  if (result.status === 'stale') process.exitCode = 2;
}

function verifyVideo(path, spec) {
  if (!ffmpegPath) throw new Error('未找到本地 FFmpeg。');
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  if (probe.error || probe.status !== 0) throw new Error(`无法读取视频流：${probe.error?.message || probe.stderr}`);
  const data = JSON.parse(probe.stdout);
  const videoStreams = data.streams.filter((stream) => stream.codec_type === 'video');
  const audioStreams = data.streams.filter((stream) => stream.codec_type === 'audio');
  const video = videoStreams[0];
  const [numerator, denominator] = String(video?.avg_frame_rate ?? '').split('/').map(Number);
  const actualFps = numerator / denominator;
  const frameCount = Number(video?.nb_frames);
  const duration = Number(video?.duration ?? data.format?.duration);
  if (videoStreams.length !== 1 || audioStreams.length !== 0 || video.codec_name !== 'h264'
    || video.width !== spec.width || video.height !== spec.height || Math.abs(actualFps - spec.fps) > 0.001
    || frameCount !== spec.durationInFrames || Math.abs(duration - spec.durationInFrames / spec.fps) > 1 / spec.fps) {
    throw new Error('静音视频的分辨率、帧率、帧数、编码或时长未匹配创作规格。');
  }
  const decode = spawnSync(ffmpegPath, ['-v', 'error', '-xerror', '-i', path, '-map', '0:v:0', '-f', 'null', '-'], { encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  if (decode.error || decode.status !== 0) throw new Error(`完整解码失败：${decode.error?.message || decode.stderr}`);
  return { decodePassed: true, codec: video.codec_name, width: video.width, height: video.height, fps: actualFps, frameCount, durationSeconds: duration, audioStreams: 0 };
}

async function createMedia() {
  const entry = safeWorkspacePath(workspaceRoot, args.entry, { mustExist: true });
  if (!/\.(m?[jt]sx?)$/.test(entry)) throw new Error('入口需要本地 JavaScript / TypeScript 文件。');
  const prepared = prepareCreativeShot({ workspaceRoot, briefPath: args.brief, sceneId: args.scene, workDir: args.workDir, take: args.take, durationSeconds: args.duration });
  const { input, takeDir, inputFingerprint, effectiveDurationOverride } = prepared;
  const stageReceiptPath = safeWorkspacePath(workspaceRoot, join(takeDir, `${args.action}-receipt.json`), { output: true });
  const mediaOutput = safeWorkspacePath(workspaceRoot, join(takeDir, args.action === 'preview' ? 'frames' : 'clip.mp4'), { output: true });
  const bundleDir = safeWorkspacePath(workspaceRoot, join(takeDir, `${args.action}-bundle`), { output: true });
  if ([stageReceiptPath, mediaOutput, bundleDir].some((path) => existsSync(path))) throw new Error('此 take 已有相同阶段产物；请使用新的 --take 保留版本。');
  const entrySha256 = sha256File(entry);
  let previewReceipt;
  if (args.action === 'render') {
    const previewPath = safeWorkspacePath(workspaceRoot, join(takeDir, 'preview-receipt.json'), { mustExist: true, output: true });
    previewReceipt = JSON.parse(readFileSync(previewPath, 'utf8'));
    const state = receiptState(previewReceipt, input, takeDir);
    if (state.status === 'stale' || previewReceipt.entry !== relative(workspaceRoot, entry) || previewReceipt.composition !== args.composition) throw new Error('preview 已过期或合成/入口不一致；请在新 take 重新预览。');
  }
  const frames = resolvePreviewFrames(input.spec.durationInFrames, args.frames);
  const authoredDependencies = new Map();
  const { bundle } = await import('@remotion/bundler');
  const { openBrowser, selectComposition, renderStill, renderMedia } = await import('@remotion/renderer');
  const startedAt = new Date().toISOString();
  let browser;
  const blockedNetwork = [];
  const networkErrors = [];
  try {
    const serveUrl = await bundle({
      entryPoint: entry, rootDir: workspaceRoot, outDir: bundleDir,
      publicDir: null, enableCaching: false, gitSource: null,
      webpackOverride: (config) => ({ ...config, plugins: [...(config.plugins ?? []), {
        apply(compiler) {
          compiler.hooks.normalModuleFactory.tap('CreativeShotPaths', (factory) => {
            factory.hooks.afterResolve.tap('CreativeShotPaths', (data) => {
              if (data.createData?.resource) safeWorkspacePath(workspaceRoot, data.createData.resource.split('?')[0], { mustExist: true });
            });
          });
          compiler.hooks.afterCompile.tap('CreativeShotInputs', (compilation) => {
            for (const dependency of compilation.fileDependencies) {
              const authored = creativeShotDependency(workspaceRoot, dependency);
              if (authored) authoredDependencies.set(authored.path, authored.sha256);
            }
          });
        },
      }] }),
    });
    if (previewReceipt) {
      const currentDeps = Object.fromEntries(authoredDependencies);
      if ((previewReceipt.authoredDependencies ?? []).some((item) => currentDeps[item.path] !== item.sha256)) throw new Error('创作依赖与 preview 不一致；请在新 take 重新预览。');
    }
    browser = await openBrowser('chrome', { browserExecutable: browserPath(), logLevel: 'error' });
    // Attach before navigation so authored pages cannot fetch remote fonts, images or APIs.
    browser.connection.on('Target.attachedToTarget', ({ sessionId }) => {
      const session = browser.connection.session(sessionId);
      if (!session) return;
      session.on('Fetch.requestPaused', ({ requestId, request }) => {
        const allowed = localNetworkUrl(request.url);
        if (!allowed) blockedNetwork.push(request.url);
        session.send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', allowed ? { requestId } : { requestId, errorReason: 'BlockedByClient' }).catch((error) => networkErrors.push(error.message));
      });
      (async () => {
        await session.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
        await session.send('Runtime.runIfWaitingForDebugger');
      })().catch((error) => networkErrors.push(error.message));
    });
    await browser.connection.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    const inputProps = { creativeShot: input };
    const composition = await selectComposition({ serveUrl, id: args.composition, inputProps, puppeteerInstance: browser, logLevel: 'error' });
    for (const key of ['width', 'height', 'fps', 'durationInFrames']) {
      if (composition[key] !== input.spec[key]) throw new Error(`Composition ${key}=${composition[key]}，必须匹配 shot-input 的 ${input.spec[key]}。`);
    }
    let artifacts;
    let technical;
    const onDownload = (url) => { if (!localNetworkUrl(url)) throw new Error('镜头工具拒绝外部素材下载。'); };
    if (args.action === 'preview') {
      mkdirSync(join(takeDir, 'frames'));
      artifacts = [];
      for (const frame of frames) {
        const path = `frames/frame-${String(frame).padStart(6, '0')}.png`;
        await renderStill({ serveUrl, composition, inputProps, frame, output: join(takeDir, path), imageFormat: 'png', puppeteerInstance: browser, logLevel: 'error', onDownload });
        artifacts.push({ path, frame, timeSeconds: frame / input.spec.fps, sha256: sha256File(join(takeDir, path)) });
      }
    } else {
      await renderMedia({ serveUrl, composition, inputProps, outputLocation: join(takeDir, 'clip.mp4'),
        codec: 'h264', pixelFormat: 'yuv420p', crf: 18, x264Preset: 'fast', muted: true, concurrency: 2,
        imageFormat: 'png', puppeteerInstance: browser, logLevel: 'error', onDownload });
      technical = verifyVideo(join(takeDir, 'clip.mp4'), input.spec);
      artifacts = [
        { path: 'clip.mp4', sha256: sha256File(join(takeDir, 'clip.mp4')) },
        { path: 'preview-receipt.json', sha256: sha256File(join(takeDir, 'preview-receipt.json')) },
        ...previewReceipt.artifacts,
      ];
    }
    if (blockedNetwork.length || networkErrors.length) throw new Error(`镜头尝试外部请求或网络拦截失败：${blockedNetwork.length} 次外部请求，${networkErrors.length} 次拦截错误。`);
    const receipt = {
      schemaVersion: 1, stage: args.action, status: 'awaiting_visual_review', semanticReview: 'not_performed',
      projectId: input.project.id, sceneId: args.scene, take: args.take,
      briefPath: relative(workspaceRoot, prepared.canonicalPath), durationOverride: effectiveDurationOverride ?? null,
      inputFingerprint, entry: relative(workspaceRoot, entry), entrySha256, composition: args.composition,
      authoredDependencies: [...authoredDependencies].sort(([a], [b]) => a.localeCompare(b)).map(([path, sha256]) => ({ path, sha256 })),
      spec: input.spec, startedAt, completedAt: new Date().toISOString(), artifacts,
      ...(technical ? { technical, previewReceiptSha256: sha256File(join(takeDir, 'preview-receipt.json')) } : {}),
    };
    const currentProject = JSON.parse(readFileSync(prepared.canonicalPath, 'utf8'));
    const currentInput = buildCreativeShotInput(currentProject, args.scene, effectiveDurationOverride);
    if (receiptState(receipt, currentInput, takeDir).status === 'stale') throw new Error('创作中输入、入口或依赖发生改变，凭证不予生成；请使用新 take。');
    writeJson(stageReceiptPath, receipt);
    console.log(JSON.stringify({ status: receipt.status, takeDir, receipt: stageReceiptPath, artifacts: artifacts.map((artifact) => join(takeDir, artifact.path)), ...(technical ? { technical } : {}) }, null, 2));
  } finally {
    if (browser) await browser.close({ silent: true });
  }
}

async function boundedWorker() {
  const child = spawn(process.execPath, [scriptPath, ...process.argv.slice(2)], {
    cwd: workspaceRoot, stdio: 'inherit', detached: process.platform !== 'win32',
    env: { ...process.env, VIDEOBRIEF_CREATIVE_SHOT_WORKER: '1' },
  });
  let timedOut = false;
  const stop = (signal) => {
    try { if (process.platform === 'win32') child.kill(signal); else process.kill(-child.pid, signal); } catch { /* The owned worker may already have exited. */ }
  };
  const timer = setTimeout(() => { timedOut = true; console.error('镜头命令达到明确的 10 分钟上限，终止本次任务进程。'); stop('SIGKILL'); }, 600_000);
  const interrupt = () => stop('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(timedOut ? 124 : code ?? 1));
    });
  } finally { clearTimeout(timer); process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); }
}

try {
  if (args.help) console.log(help);
  else if (args.action === 'inspect') inspect();
  else if (args.action === 'prepare') {
    const { takeDir, input } = prepareCreativeShot({ workspaceRoot, briefPath: args.brief, sceneId: args.scene, workDir: args.workDir, take: args.take, durationSeconds: args.duration });
    console.log(JSON.stringify({ status: 'prepared', takeDir, brief: join(takeDir, 'shot-brief.md'), input: join(takeDir, 'shot-input.json'), spec: input.spec }, null, 2));
  } else if (process.env.VIDEOBRIEF_CREATIVE_SHOT_WORKER === '1') await createMedia();
  else await boundedWorker();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
