import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { EdgeTTS } from 'edge-tts-universal';
import { readBrief } from './shortVideoProjectServer';

const voicePreviewDir = resolve('output/voice-previews');

interface VoicePreviewAdapter {
  id: string;
  extension: 'aiff' | 'mp3';
  mimeType: 'audio/aiff' | 'audio/mpeg';
  generate(options: {
    text: string;
    voice: string;
    rate: number;
    outputPath: string;
  }): Promise<void>;
}

function runSay(args: string[]) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn('/usr/bin/say', args, { cwd: process.cwd(), env: process.env });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(stderr || `say exited with ${code}`));
    });
  });
}

const macOsSayAdapter: VoicePreviewAdapter = {
  id: 'macos-say',
  extension: 'aiff',
  mimeType: 'audio/aiff',
  generate({ text, voice, rate, outputPath }) {
    return runSay(['-v', voice, '-r', String(rate), '-o', outputPath, text]);
  },
};

function edgeRate(rate: number) {
  const percent = Math.max(-50, Math.min(50, Math.round((rate / 190 - 1) * 100)));
  return `${percent >= 0 ? '+' : ''}${percent}%`;
}

const edgeTtsAdapter: VoicePreviewAdapter = {
  id: 'edge-tts',
  extension: 'mp3',
  mimeType: 'audio/mpeg',
  async generate({ text, voice, rate, outputPath }) {
    const tts = new EdgeTTS(text, voice, {
      rate: edgeRate(rate),
      volume: '+0%',
      pitch: '+0Hz',
    });
    const result = await tts.synthesize();
    writeFileSync(outputPath, Buffer.from(await result.audio.arrayBuffer()));
  },
};

export async function generateVoicePreview(projectId: string, sceneId: string, inputText: string) {
  const project = readBrief(projectId);
  if (!project.scenes.some((scene) => scene.id === sceneId)) {
    throw new Error('Scene does not belong to the current project.');
  }
  const text = inputText.trim();
  if (!text) throw new Error('试听文案不能为空。');
  if (text.length > 600) throw new Error('试听文案不能超过 600 个字符。');
  const adapter = project.render.voice.endsWith('Neural') ? edgeTtsAdapter : macOsSayAdapter;

  const key = createHash('sha256')
    .update(
      JSON.stringify({
        projectId: project.id,
        sceneId,
        text,
        adapter: adapter.id,
        voice: project.render.voice,
        rate: project.render.rate,
      }),
    )
    .digest('hex');
  const outputPath = resolve(voicePreviewDir, `${key}.${adapter.extension}`);
  const cacheHit = existsSync(outputPath) && statSync(outputPath).size > 0;

  if (!cacheHit) {
    mkdirSync(voicePreviewDir, { recursive: true });
    const temporaryPath = resolve(voicePreviewDir, `${key}-${process.pid}.tmp.${adapter.extension}`);
    await adapter.generate({
      text,
      voice: project.render.voice,
      rate: project.render.rate,
      outputPath: temporaryPath,
    });
    renameSync(temporaryPath, outputPath);
  }

  return {
    key,
    cacheHit,
    adapter: adapter.id,
    voice: project.render.voice,
    href: `/api/workbench/voice-preview?key=${key}`,
  };
}

export function readVoicePreview(key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) return null;
  const candidates = [
    { path: resolve(voicePreviewDir, `${key}.mp3`), mimeType: 'audio/mpeg' },
    { path: resolve(voicePreviewDir, `${key}.aiff`), mimeType: 'audio/aiff' },
  ] as const;
  const audio = candidates.find((candidate) => existsSync(candidate.path) && statSync(candidate.path).size > 0);
  if (!audio) return null;
  return { buffer: readFileSync(audio.path), mimeType: audio.mimeType };
}
