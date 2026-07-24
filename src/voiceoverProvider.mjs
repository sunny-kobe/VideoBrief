import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { EdgeTTS } from 'edge-tts-universal';

export const VOICEOVER_PROVIDER_VERSION = 'videobrief-voiceover-v1';
export const DEFAULT_VOICE_CACHE_DIR = resolve('output/voice-cache');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function loadLocalEnvironment() {
  if (process.env.GEMINI_API_KEY?.trim() || !existsSync(resolve('.env.local'))) return;
  process.loadEnvFile(resolve('.env.local'));
}

export function resolveVoiceoverConfig(render = {}) {
  const voice = text(render.voice) || 'zh-CN-YunxiNeural';
  const legacyEngine = voice.endsWith('Neural') ? 'edge-tts' : 'macos-say';
  const engine = ['edge-tts', 'gemini-tts', 'macos-say'].includes(render.voiceEngine)
    ? render.voiceEngine
    : legacyEngine;
  const defaultModel = engine === 'gemini-tts'
    ? 'gemini-3.1-flash-tts-preview'
    : engine === 'edge-tts'
      ? 'edge-tts-universal'
      : 'macos-say';
  const pronunciations = Array.isArray(render.pronunciations)
    ? render.pronunciations
      .map((item) => {
        const spokenText = text(item?.spokenText);
        return {
          term: text(item?.term),
          guidance: text(item?.guidance),
          ...(spokenText ? { spokenText } : {}),
        };
      })
      .filter((item) => item.term && item.guidance)
    : [];
  return {
    engine,
    model: text(render.voiceModel) || defaultModel,
    voice,
    rate: Number.isFinite(Number(render.rate)) ? Number(render.rate) : 198,
    profile: text(render.voiceProfile) || 'default',
    style: text(render.voiceStyle),
    pronunciations,
  };
}

export function applySpokenPronunciations(inputText, pronunciations = []) {
  return pronunciations
    .filter((item) => item.term && item.spokenText && inputText.includes(item.term))
    .sort((left, right) => right.term.length - left.term.length)
    .reduce(
      (result, item) => result.replaceAll(item.term, item.spokenText),
      inputText,
    );
}

export function buildGeminiPrompt(inputText, config) {
  const relevantPronunciations = config.pronunciations.filter((item) => inputText.includes(item.term));
  const pronunciationGuide = relevantPronunciations.length
    ? [
        '发音规则（只影响读法，不改变原文内容）：',
        ...relevantPronunciations.map((item) => `- ${item.term}：${item.guidance}`),
      ].join('\n')
    : '';
  return [
    config.style,
    pronunciationGuide,
    '必须逐字忠实朗读“原文”部分；不要读出风格说明、发音规则或“原文”这两个字。',
    '原文：',
    inputText,
  ].filter(Boolean).join('\n\n');
}

export function voiceoverCacheKey(inputText, config) {
  const effectiveConfig = {
    ...config,
    pronunciations: config.pronunciations.filter((item) => inputText.includes(item.term)),
  };
  return createHash('sha256').update(JSON.stringify({
    providerVersion: VOICEOVER_PROVIDER_VERSION,
    text: inputText,
    config: effectiveConfig,
  })).digest('hex');
}

function pcm16ToWav(pcm, sampleRate, channels = 1) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function edgeRate(value) {
  const percent = Math.max(-50, Math.min(50, Math.round((value / 190 - 1) * 100)));
  return `${percent >= 0 ? '+' : ''}${percent}%`;
}

async function retry(operation, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (error?.permanent === true) break;
      if (attempt < attempts) {
        const delay = Number.isFinite(error?.retryAfterMs)
          ? Math.max(500, error.retryAfterMs)
          : attempt * 500;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
      }
    }
  }
  throw lastError;
}

export function geminiFailurePolicy(status, message, attempt, quotaIds = []) {
  if (status === 429) {
    if (quotaIds.some((quotaId) => /perday/i.test(String(quotaId)))) {
      return { permanent: true, retryAfterMs: null };
    }
    const retrySeconds = Number(String(message).match(/retry in\s+([\d.]+)s/i)?.[1] ?? 0);
    return {
      permanent: false,
      retryAfterMs: retrySeconds > 0 ? Math.ceil(retrySeconds * 1000) + 5_000 : 30_000,
    };
  }
  if (
    status === 400
    && /request contains an invalid argument/i.test(String(message))
    && attempt <= 3
  ) {
    return { permanent: false, retryAfterMs: attempt * 5_000 };
  }
  return {
    permanent: status >= 400 && status < 500,
    retryAfterMs: null,
  };
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function generateEdge(inputText, config) {
  const result = await retry(async () => {
    const spokenText = applySpokenPronunciations(inputText, config.pronunciations);
    const tts = new EdgeTTS(spokenText, config.voice, {
      rate: edgeRate(config.rate),
      volume: '+0%',
      pitch: '+0Hz',
    });
    return withTimeout(tts.synthesize(), 30_000, 'Edge TTS timed out after 30 seconds.');
  });
  const audio = Buffer.from(await result.audio.arrayBuffer());
  if (!audio.length) throw new Error('Edge TTS returned empty audio.');
  return { audio, extension: 'mp3', mimeType: 'audio/mpeg', sourceSampleRate: null, finishReason: null };
}

async function generateGemini(inputText, config) {
  loadLocalEnvironment();
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing; Gemini voiceover was not called.');
  const body = await retry(async (attempt) => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildGeminiPrompt(inputText, config) }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voice } } },
          },
        }),
        signal: AbortSignal.timeout(180_000),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(payload.error?.message ?? 'no message');
      const quotaIds = (Array.isArray(payload.error?.details) ? payload.error.details : [])
        .flatMap((detail) => Array.isArray(detail?.violations) ? detail.violations : [])
        .map((violation) => String(violation?.quotaId ?? ''))
        .filter(Boolean);
      const failure = new Error(`Gemini TTS failed (${response.status} ${payload.error?.status ?? 'unknown'}): ${message}`);
      failure.status = response.status;
      failure.quotaIds = quotaIds;
      const policy = geminiFailurePolicy(response.status, message, attempt, quotaIds);
      failure.permanent = policy.permanent;
      if (policy.retryAfterMs != null) failure.retryAfterMs = policy.retryAfterMs;
      throw failure;
    }
    return payload;
  }, 5);
  const audioPart = body.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data);
  if (!audioPart?.inlineData?.data) throw new Error('Gemini TTS returned no inline audio.');
  const mimeType = String(audioPart.inlineData.mimeType ?? 'audio/L16;rate=24000');
  const sampleRate = Number(mimeType.match(/rate=(\d+)/i)?.[1] ?? 24000);
  const pcm = Buffer.from(audioPart.inlineData.data, 'base64');
  if (!pcm.length) throw new Error('Gemini TTS returned empty PCM.');
  return {
    audio: pcm16ToWav(pcm, sampleRate),
    extension: 'wav',
    mimeType: 'audio/wav',
    sourceSampleRate: sampleRate,
    finishReason: body.candidates?.[0]?.finishReason ?? null,
  };
}

function generateMacOs(inputText, config, outputPath) {
  const spokenText = applySpokenPronunciations(inputText, config.pronunciations);
  const result = spawnSync('/usr/bin/say', [
    '-v', config.voice,
    '-r', String(config.rate),
    '-o', outputPath,
    spokenText,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `say exited with ${result.status}`);
}

export async function synthesizeVoiceover(inputText, render, options = {}) {
  const originalText = text(inputText);
  if (!originalText) throw new Error('Voiceover text is empty.');
  const config = resolveVoiceoverConfig(render);
  const key = voiceoverCacheKey(originalText, config);
  const cacheDir = resolve(options.cacheDir ?? DEFAULT_VOICE_CACHE_DIR);
  const extension = config.engine === 'gemini-tts' ? 'wav' : config.engine === 'edge-tts' ? 'mp3' : 'aiff';
  const outputPath = resolve(cacheDir, `${key}.${extension}`);
  const metadataPath = resolve(cacheDir, `${key}.json`);
  const cacheHit = existsSync(outputPath) && statSync(outputPath).size > 0 && existsSync(metadataPath);
  if (!cacheHit) {
    mkdirSync(cacheDir, { recursive: true });
    const temporaryPath = resolve(cacheDir, `${key}-${process.pid}.tmp.${extension}`);
    let generated;
    if (config.engine === 'gemini-tts') generated = await generateGemini(originalText, config);
    else if (config.engine === 'edge-tts') generated = await generateEdge(originalText, config);
    else {
      generateMacOs(originalText, config, temporaryPath);
      generated = { extension, mimeType: 'audio/aiff', sourceSampleRate: null, finishReason: null };
    }
    if (generated.audio) writeFileSync(temporaryPath, generated.audio);
    if (!existsSync(temporaryPath) || statSync(temporaryPath).size === 0) {
      throw new Error(`${config.engine} returned an empty voiceover file.`);
    }
    renameSync(temporaryPath, outputPath);
    writeFileSync(metadataPath, `${JSON.stringify({
      schemaVersion: 1,
      providerVersion: VOICEOVER_PROVIDER_VERSION,
      key,
      config,
      textSha256: createHash('sha256').update(originalText).digest('hex'),
      audioSha256: createHash('sha256').update(readFileSync(outputPath)).digest('hex'),
      bytes: statSync(outputPath).size,
      mimeType: generated.mimeType,
      sourceSampleRate: generated.sourceSampleRate,
      finishReason: generated.finishReason,
      createdAt: new Date().toISOString(),
    }, null, 2)}\n`);
  }
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  if (options.copyTo) copyFileSync(outputPath, resolve(options.copyTo));
  return { key, path: outputPath, extension, cacheHit, config, metadata };
}
