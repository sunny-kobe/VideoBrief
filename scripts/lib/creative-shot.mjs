import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { buildProjectStageContext } from './project-stage-context.mjs';

const actions = ['prepare', 'preview', 'render', 'inspect'];
const flags = new Set(['brief', 'scene', 'entry', 'composition', 'work-dir', 'take', 'duration', 'frames']);

export function parseCreativeShotArgs(args) {
  if (args.length === 0 || args.includes('--help')) return { help: true };
  const [action, ...arguments_] = args;
  if (!actions.includes(action)) throw new Error(`未知动作 ${action}；允许 ${actions.join(' / ')}。`);
  const parsed = { action, take: 'take-01', frames: [] };
  const seen = new Set();
  for (const argument of arguments_) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match || !flags.has(match[1])) throw new Error(`未知或无值参数：${argument}`);
    if (seen.has(match[1])) throw new Error(`参数重复：--${match[1]}`);
    seen.add(match[1]);
    const key = match[1] === 'work-dir' ? 'workDir' : match[1];
    parsed[key] = match[2];
  }
  if (!parsed.brief || !parsed.scene) throw new Error('需要 --brief=<canonical project> 和 --scene=<场景id>。');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(parsed.take)) throw new Error('--take 必须是单层名称，仅允许字母、数字、_、-。');
  if (parsed.duration !== undefined) {
    parsed.duration = Number(parsed.duration);
    if (!Number.isFinite(parsed.duration) || parsed.duration <= 0 || parsed.duration > 600) throw new Error('--duration 必须在 (0,600] 秒内。');
  }
  if (typeof parsed.frames === 'string') {
    if (!/^\d+(,\d+)*$/.test(parsed.frames)) throw new Error('--frames 必须是逗号分隔的非负整数帧。');
    parsed.frames = parsed.frames.split(',').map(Number);
  }
  if (['preview', 'render'].includes(action) && (!parsed.entry || !parsed.composition)) throw new Error('preview / render 需要 --entry=<已编写的可信入口> 和 --composition=<合成id>。');
  if (action === 'prepare' && (parsed.entry || parsed.composition || parsed.frames.length)) throw new Error('prepare 只生成创作简报；入口、合成和帧参数用于 preview / render。');
  return parsed;
}

function inside(root, path) {
  const difference = relative(root, path);
  return difference === '' || (!difference.startsWith(`..${sep}`) && difference !== '..' && !isAbsolute(difference));
}

export function safeWorkspacePath(workspaceRoot, value, { mustExist = false, output = false, kind = 'file' } = {}) {
  if (!['file', 'any'].includes(kind)) throw new Error('无效路径类型。');
  const root = realpathSync(workspaceRoot);
  const lexicalRoot = resolve(workspaceRoot);
  const requested = resolve(lexicalRoot, value);
  const path = inside(lexicalRoot, requested) ? resolve(root, relative(lexicalRoot, requested)) : requested;
  if (!inside(root, path)) throw new Error(`路径必须位于当前工作区：${value}`);
  if (output && (!inside(join(root, 'output'), path) || path === join(root, 'output'))) throw new Error('创作产物必须位于工作区 output 的子目录。');
  let ancestor = path;
  while (ancestor !== dirname(ancestor)) {
    try { lstatSync(ancestor); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    ancestor = dirname(ancestor);
  }
  let actualAncestor;
  try { actualAncestor = realpathSync(ancestor); } catch { throw new Error(`符号链接目标不存在：${value}`); }
  if (!inside(root, actualAncestor)) throw new Error(`符号链接越出工作区：${value}`);
  if (output && inside(join(root, 'output'), ancestor) && !inside(join(root, 'output'), actualAncestor)) throw new Error('产物符号链接越出 output 目录。');
  if (mustExist && !existsSync(path)) throw new Error(`文件不存在：${value}`);
  if (mustExist && kind === 'file' && !statSync(path).isFile()) throw new Error(`需要文件路径：${value}`);
  return path;
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function creativeShotDependency(workspaceRoot, dependency) {
  if (!existsSync(dependency)) return null;
  // Webpack records resolver ancestors as directory dependencies. Their names
  // carry no authored input; ignore these exact parent directories without
  // traversing them. Actual imported files still pass the workspace boundary.
  const root = realpathSync(workspaceRoot);
  if (statSync(dependency).isDirectory() && !inside(resolve(workspaceRoot), resolve(dependency))
    && inside(realpathSync(dependency), root)) return null;
  const path = safeWorkspacePath(workspaceRoot, dependency, { mustExist: true, kind: 'any' });
  const workspacePath = relative(root, path);
  if (!statSync(path).isFile() || workspacePath.split(sep).includes('node_modules')) return null;
  return { path: workspacePath, sha256: sha256File(path) };
}

export function creativeShotFingerprint(input) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function validSpecNumber(value, name, max, integer = false) {
  if (!Number.isFinite(value) || value <= 0 || value > max || (integer && !Number.isInteger(value))) throw new Error(`场景 ${name} 无效。`);
  return value;
}

export function buildCreativeShotInput(project, sceneId, durationSeconds) {
  const scene = (project.scenes ?? []).find((item) => item.id === sceneId);
  if (!scene || scene.enabled === false) throw new Error(`场景不存在或已禁用：${sceneId}`);
  const context = buildProjectStageContext(project, 'material');
  const compactScene = context.scenes.find((item) => item.id === sceneId);
  const rate = validSpecNumber(Number(scene.mediaPlaybackRate ?? 1), '播放速率', 100);
  const lockedWindow = {
    sourceId: scene.sourceId ?? '', sourceStart: Number(scene.sourceStart ?? 0),
    sourceEnd: Number(scene.sourceEnd ?? 0), mediaPlaybackRate: rate,
  };
  const duration = validSpecNumber(Number(durationSeconds ?? scene.duration ?? (lockedWindow.sourceEnd - lockedWindow.sourceStart) / rate), '时长（窗口无有效时长时请显式使用 --duration）', 600);
  const width = validSpecNumber(Number(project.render?.width ?? 1920), '宽度', 8192, true);
  const height = validSpecNumber(Number(project.render?.height ?? 1080), '高度', 8192, true);
  const fps = validSpecNumber(Number(project.render?.fps ?? 30), '帧率', 120);
  if (width % 2 || height % 2) throw new Error('H.264 输出宽高必须是偶数。');
  const sourceIds = new Set([scene.sourceId, ...(scene.sourceReferences ?? []).map((ref) => ref.sourceId)].filter(Boolean));
  return {
    schemaVersion: 1,
    project: { id: project.id ?? '', title: project.title ?? '' },
    brief: project.brief ?? {},
    scene: compactScene,
    sceneFingerprint: creativeShotFingerprint(scene),
    lockedWindow,
    spec: { width, height, fps, durationSeconds: duration, durationInFrames: Math.ceil(duration * fps) },
    referencedSources: context.sources.filter((source) => sourceIds.has(source.id)).map(({ processing, ...source }) => source),
  };
}

export function resolvePreviewFrames(durationInFrames, additionalFrames = []) {
  if (!Number.isSafeInteger(durationInFrames) || durationInFrames < 1) throw new Error('总帧数必须为正整数。');
  for (const frame of additionalFrames) {
    if (!Number.isSafeInteger(frame) || frame < 0 || frame >= durationInFrames) throw new Error(`预览帧越界或无效：${frame}（合法范围 0..${durationInFrames - 1}）。`);
  }
  return [...new Set([0, Math.floor(durationInFrames / 2), durationInFrames - 1, ...additionalFrames])].sort((a, b) => a - b);
}

function shotBrief(input, take) {
  return `# 单幕创作简报：${input.scene.title || input.scene.id}\n\n`
    + `项目：${input.project.title}（${input.project.id}）\n场景：${input.scene.id}\n版本：${take}\n\n`
    + `## 观众与目标\n\n${JSON.stringify(input.brief, null, 2)}\n\n`
    + `## 当前旁白\n\n${input.scene.narration || '（无旁白）'}\n\n`
    + `## 镜头必须表达什么\n\n${input.scene.visualRequirement || '（需由会话明确一个可见变化）'}\n\n`
    + `先明确一个可见变化，再设计动作、信息层和节拍。开场、变化过程、最终状态都要可辨认；关键文字应在实际播放器尺寸直接可读。教学机制画面保持稳定，不用默认推拉运动。\n\n`
    + `## 输出规格\n\n${input.spec.width}×${input.spec.height}，${input.spec.fps} fps，${input.spec.durationInFrames} 帧（${(input.spec.durationInFrames / input.spec.fps).toFixed(3)} 秒），静音 H.264。\n\n`
    + `Remotion inputProps.creativeShot 提供 shot-input.json 的完整投影；Composition 的宽、高、fps、durationInFrames 必须与 spec 一致。\n\n`
    + `## 原素材锁定窗口\n\n${JSON.stringify(input.lockedWindow, null, 2)}\n\n`
    + `这是原候选的不可变记录。新镜头的目标时长不会改写原窗口。配音能否覆盖窗口仍由正式旁白预检判断。\n\n`
    + `## 一手来源与定位\n\n${JSON.stringify({ sourceReferences: input.scene.sourceReferences, sources: input.referencedSources }, null, 2)}\n\n`
    + `## 创作与复核\n\n1. 由当前会话编写可信、本地、自包含的 Remotion 入口；禁止把 API 返回的代码或下载素材中的代码直接执行。\n2. preview 仅输出始、中、末与指定关键帧，逐帧检查旁白匹配、运动状态、标签重叠和可读性。修改时使用新 take。\n3. 预览复核后再 render，检查完整静音片段的节奏；始中末帧不能证明动作连续性。\n4. 凭证状态 awaiting_visual_review 仅表示产物待审。需经现有素材导入、配音预检、Material Gate、正式渲染与语义/浏览器验收进入成片。\n\n`
    + `工具不改 canonical project，不调用独立 AI 接口，不安装依赖或下载浏览器。原创示意画面不能冒充真实事件证据。\n`;
}

export function prepareCreativeShot({ workspaceRoot, briefPath, sceneId, workDir, take = 'take-01', durationSeconds }) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(take)) throw new Error('无效 take 名称。');
  const canonicalPath = safeWorkspacePath(workspaceRoot, briefPath, { mustExist: true });
  const project = JSON.parse(readFileSync(canonicalPath, 'utf8'));
  const defaultDir = `output/creative-shots/${encodeURIComponent(project.id ?? '')}/${encodeURIComponent(sceneId)}`;
  const takeDir = safeWorkspacePath(workspaceRoot, join(workDir || defaultDir, take), { output: true });
  const preparedReceiptPath = safeWorkspacePath(workspaceRoot, join(takeDir, 'prepared-receipt.json'), { output: true });
  const previousReceipt = existsSync(preparedReceiptPath) ? JSON.parse(readFileSync(preparedReceiptPath, 'utf8')) : null;
  const effectiveDurationOverride = durationSeconds ?? previousReceipt?.durationOverride ?? undefined;
  const input = buildCreativeShotInput(project, sceneId, effectiveDurationOverride);
  const inputPath = safeWorkspacePath(workspaceRoot, join(takeDir, 'shot-input.json'), { output: true });
  const fingerprint = creativeShotFingerprint(input);
  if (existsSync(inputPath)) {
    if (creativeShotFingerprint(JSON.parse(readFileSync(inputPath, 'utf8'))) !== fingerprint) throw new Error('当前 take 输入过期；请使用新的 --take 保留旧版本。');
  } else {
    mkdirSync(takeDir, { recursive: true });
    writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`, { flag: 'wx' });
    writeFileSync(join(takeDir, 'shot-brief.md'), shotBrief(input, take), { flag: 'wx' });
    writeFileSync(preparedReceiptPath, `${JSON.stringify({
      schemaVersion: 1, stage: 'prepare', status: 'prepared', projectId: input.project.id, sceneId,
      createdAt: new Date().toISOString(), briefPath: relative(workspaceRoot, canonicalPath), take,
      durationOverride: effectiveDurationOverride ?? null, inputFingerprint: fingerprint, spec: input.spec,
      semanticReview: 'not_performed',
    }, null, 2)}\n`, { flag: 'wx' });
  }
  return { input, inputFingerprint: fingerprint, canonicalPath, takeDir, effectiveDurationOverride };
}

export function getCreativeShotReceiptStatus(receipt, currentInput, currentEntrySha256, artifactHashes = {}, dependencyHashes = {}) {
  const staleReasons = [];
  if (receipt.inputFingerprint !== creativeShotFingerprint(currentInput)) staleReasons.push('canonical 场景、简报、来源或规格已改变');
  if (receipt.entrySha256 && receipt.entrySha256 !== currentEntrySha256) staleReasons.push('创作入口已改变或缺失');
  for (const artifact of receipt.artifacts ?? []) {
    if (artifactHashes[artifact.path] !== artifact.sha256) staleReasons.push(`产物已改变或缺失：${artifact.path}`);
  }
  for (const dependency of receipt.authoredDependencies ?? []) {
    if (dependencyHashes[dependency.path] !== dependency.sha256) staleReasons.push(`创作依赖已改变或缺失：${dependency.path}`);
  }
  return { status: staleReasons.length ? 'stale' : receipt.status, staleReasons, semanticReview: 'not_performed' };
}
