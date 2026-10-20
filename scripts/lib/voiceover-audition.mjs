import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import {
  resolveVoiceoverConfig, synthesizeVoiceover, voiceoverCacheKey, VOICEOVER_PROVIDER_VERSION,
} from '../../src/voiceoverProvider.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const engines = ['edge-tts', 'gemini-tts', 'macos-say'];
const extensions = { 'edge-tts': 'mp3', 'gemini-tts': 'wav', 'macos-say': 'aiff' };

function assertWorkDir(cwd, workDir) {
  const root = resolve(cwd, 'output/voice-auditions');
  const inside = relative(root, workDir);
  if (!inside || inside === '..' || inside.startsWith(`..${sep}`) || resolve(root, inside) !== workDir) {
    throw new Error('Trial output must be a child directory of output/voice-auditions.');
  }
  let ancestor = workDir;
  while (ancestor !== cwd && ancestor !== dirname(ancestor)) {
    if (existsSync(ancestor) && lstatSync(ancestor).isSymbolicLink()) {
      throw new Error('Trial output cannot pass through a symbolic link.');
    }
    ancestor = dirname(ancestor);
  }
}

function assertAllowedKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`${label} has unsupported field(s): ${unknown.join(', ')}. Voice settings come only from the canonical project.`);
}

export function buildVoiceoverAuditionPlan(project, candidate, options = {}) {
  if (!project?.id || !project?.render) throw new Error('Canonical project id and render settings are required.');
  if (project.render.voiceEngine && !engines.includes(project.render.voiceEngine)) {
    throw new Error('Canonical project voiceEngine is unsupported; no fallback engine was selected.');
  }
  const cwd = resolve(options.cwd ?? process.cwd());
  const projectId = String(project.id);
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) throw new Error('Canonical project id is invalid.');
  const workDir = resolve(cwd, options.workDir ?? `output/voice-auditions/${projectId}-${Date.now()}`);
  assertWorkDir(cwd, workDir);
  assertAllowedKeys(candidate, ['schemaVersion', 'variants'], 'Candidate');
  if (candidate.schemaVersion != null && candidate.schemaVersion !== 1) throw new Error('Candidate schemaVersion must be 1.');
  if (!Array.isArray(candidate.variants) || candidate.variants.length < 1 || candidate.variants.length > 4) {
    throw new Error('Candidate must contain 1 to 4 variants.');
  }
  const config = resolveVoiceoverConfig(project.render);
  const ids = new Set();
  const variants = candidate.variants.map((item) => {
    assertAllowedKeys(item, ['id', 'label', 'text'], 'Variant');
    if (typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(item.id) || ids.has(item.id)) {
      throw new Error('Each variant needs a unique lowercase id (up to 64 characters).');
    }
    ids.add(item.id);
    if (typeof item.text !== 'string' || !item.text.trim() || Array.from(item.text.trim()).length > 600) {
      throw new Error(`Variant ${item.id} text must contain 1 to 600 characters.`);
    }
    if (item.label != null && (typeof item.label !== 'string' || item.label.length > 120)) {
      throw new Error(`Variant ${item.id} label must be a string up to 120 characters.`);
    }
    const text = item.text.trim();
    return { id: item.id, label: item.label?.trim() || item.id, text, textSha256: sha256(text), cacheKey: voiceoverCacheKey(text, config) };
  });
  const sourceNarration = (project.scenes ?? []).filter((scene) => scene.enabled !== false)
    .map((scene) => ({ sceneId: scene.id, text: String(scene.narration ?? scene.subtitle ?? '') }));
  return {
    schemaVersion: 1,
    status: 'prepared',
    projectId,
    briefPath: options.briefPath ? resolve(cwd, options.briefPath) : null,
    projectSnapshotSha256: sha256(JSON.stringify(project)),
    sourceNarration,
    sourceNarrationSha256: sha256(JSON.stringify(sourceNarration)),
    cwd,
    workDir,
    providerVersion: VOICEOVER_PROVIDER_VERSION,
    voice: {
      ...config,
      effectiveStyle: config.engine === 'gemini-tts' ? config.style : '',
      effectiveRate: config.engine === 'gemini-tts' ? null : config.rate,
      rateControl: config.engine === 'gemini-tts' ? 'style-prompt-only; numeric-rate-is-not-sent' : config.engine === 'edge-tts' ? 'relative-percent-from-190' : 'words-per-minute',
    },
    renderConfig: {
      voiceEngine: config.engine, voiceModel: config.model, voice: config.voice, rate: config.rate,
      voiceProfile: config.profile, voiceStyle: config.style, pronunciations: config.pronunciations,
    },
    variants,
    humanListening: { status: 'pending', checks: ['自然交流感', '重点与停顿', '专名与数字', '开场吸引力', '与画面动作的配合'] },
    limitations: ['试读不是正式渲染，不改变项目或验收。', '音频时长和技术有效性不能证明听感自然。'],
  };
}

function reusableCache(plan, variant) {
  const extension = extensions[plan.voice.engine];
  const path = resolve(plan.cwd, 'output/voice-cache', `${variant.cacheKey}.${extension}`);
  const metadataPath = resolve(plan.cwd, 'output/voice-cache', `${variant.cacheKey}.json`);
  if (!existsSync(path) || !existsSync(metadataPath)) return null;
  try {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    const bytes = readFileSync(path);
    if (!bytes.length || metadata.key !== variant.cacheKey || metadata.providerVersion !== plan.providerVersion
      || metadata.textSha256 !== variant.textSha256 || metadata.audioSha256 !== sha256(bytes)) return null;
    return { path, extension, key: variant.cacheKey, cacheHit: true, config: plan.voice, metadata };
  } catch { return null; }
}

export async function measureVoiceoverDuration(path) {
  const result = spawnSync(ffmpegPath, [
    '-hide_banner', '-nostats', '-i', path, '-map', '0:a:0', '-progress', 'pipe:1', '-f', 'null', '-',
  ], { encoding: 'utf8', timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Trial audio could not fully decode: ${result.error?.message ?? result.stderr.slice(-600)}`);
  const times = [...result.stdout.matchAll(/out_time_us=(\d+)/g)].map((match) => Number(match[1]) / 1_000_000);
  const duration = Math.max(0, ...times);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Trial audio has no measurable duration.');
  return duration;
}

export async function runVoiceoverAudition(plan, options = {}) {
  if (options.render !== true) return plan;
  assertWorkDir(plan.cwd, plan.workDir);
  if (existsSync(plan.workDir)) throw new Error('Trial work directory already exists; choose a fresh work-dir to preserve previous audio.');
  mkdirSync(dirname(plan.workDir), { recursive: true });
  mkdirSync(plan.workDir);
  const { cwd, renderConfig, ...receiptBase } = plan;
  writeFileSync(resolve(plan.workDir, 'plan.json'), `${JSON.stringify(receiptBase, null, 2)}\n`, { flag: 'wx' });
  const variants = [];
  const synthesize = options.synthesize ?? synthesizeVoiceover;
  const measureDuration = options.measureDuration ?? measureVoiceoverDuration;
  try {
    for (const variant of plan.variants) {
      const cached = reusableCache(plan, variant);
      const generated = cached ?? await synthesize(variant.text, renderConfig, { cacheDir: resolve(plan.workDir, 'cache') });
      if (generated.config.engine !== plan.voice.engine || generated.config.voice !== plan.voice.voice || generated.key !== variant.cacheKey) {
        throw new Error(`Variant ${variant.id} provider output does not match the planned engine, voice or text cache key.`);
      }
      if (generated.extension !== extensions[plan.voice.engine]) throw new Error('Trial audio extension does not match the planned provider.');
      const audio = readFileSync(generated.path);
      if (!audio.length || generated.metadata.audioSha256 !== sha256(audio)) throw new Error('Trial audio bytes do not match their provider metadata.');
      const audioPath = resolve(plan.workDir, `${variant.id}.${generated.extension}`);
      if (existsSync(audioPath)) throw new Error('Refusing to overwrite trial audio.');
      copyFileSync(generated.path, audioPath);
      const durationSeconds = await measureDuration(audioPath);
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Trial audio duration must be positive.');
      variants.push({
        ...variant, voice: plan.voice, audioPath, audioSha256: sha256(audio), bytes: statSync(audioPath).size,
        durationSeconds, fullDecodePassed: true, cacheHit: generated.cacheHit,
        cacheSource: cached ? 'existing-voice-cache' : generated.cacheHit ? 'audition-cache' : 'provider',
        listeningStatus: 'pending',
      });
    }
    const receipt = { ...receiptBase, status: 'awaiting-human-listening', generatedAt: new Date().toISOString(), variants };
    writeFileSync(resolve(plan.workDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
    return receipt;
  } catch (error) {
    writeFileSync(resolve(plan.workDir, 'failure.json'), `${JSON.stringify({ status: 'failed', projectId: plan.projectId, completedVariants: variants, failedAt: new Date().toISOString(), message: error instanceof Error ? error.message : String(error) }, null, 2)}\n`, { flag: 'wx' });
    throw error;
  }
}
