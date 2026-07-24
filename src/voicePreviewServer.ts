import {
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { readBrief } from './shortVideoProjectServer';
import { DEFAULT_VOICE_CACHE_DIR, synthesizeVoiceover } from './voiceoverProvider.mjs';

const voicePreviewDir = resolve('output/voice-previews');

export async function generateVoicePreview(projectId: string, sceneId: string, inputText: string) {
  const project = readBrief(projectId);
  if (!project.scenes.some((scene) => scene.id === sceneId)) {
    throw new Error('Scene does not belong to the current project.');
  }
  const text = inputText.trim();
  if (!text) throw new Error('试听文案不能为空。');
  if (text.length > 600) throw new Error('试听文案不能超过 600 个字符。');
  const generated = await synthesizeVoiceover(text, project.render);

  return {
    key: generated.key,
    cacheHit: generated.cacheHit,
    adapter: generated.config.engine,
    model: generated.config.model,
    voice: generated.config.voice,
    href: `/api/workbench/voice-preview?key=${generated.key}`,
  };
}

export function readVoicePreview(key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) return null;
  const candidates = [
    { path: resolve(DEFAULT_VOICE_CACHE_DIR, `${key}.wav`), mimeType: 'audio/wav' },
    { path: resolve(DEFAULT_VOICE_CACHE_DIR, `${key}.mp3`), mimeType: 'audio/mpeg' },
    { path: resolve(DEFAULT_VOICE_CACHE_DIR, `${key}.aiff`), mimeType: 'audio/aiff' },
    { path: resolve(voicePreviewDir, `${key}.mp3`), mimeType: 'audio/mpeg' },
    { path: resolve(voicePreviewDir, `${key}.aiff`), mimeType: 'audio/aiff' },
  ] as const;
  const audio = candidates.find((candidate) => existsSync(candidate.path) && statSync(candidate.path).size > 0);
  if (!audio) return null;
  return { buffer: readFileSync(audio.path), mimeType: audio.mimeType };
}
