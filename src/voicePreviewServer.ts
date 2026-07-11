import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { readBrief } from './shortVideoProjectServer';

const voicePreviewDir = resolve('output/voice-previews');

interface VoicePreviewAdapter {
  id: string;
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
  generate({ text, voice, rate, outputPath }) {
    return runSay(['-v', voice, '-r', String(rate), '-o', outputPath, text]);
  },
};

export async function generateVoicePreview(sceneId: string, inputText: string) {
  const project = readBrief();
  if (!project.scenes.some((scene) => scene.id === sceneId)) {
    throw new Error('Scene does not belong to the current project.');
  }
  const text = inputText.trim();
  if (!text) throw new Error('试听文案不能为空。');
  if (text.length > 600) throw new Error('试听文案不能超过 600 个字符。');

  const key = createHash('sha256')
    .update(
      JSON.stringify({
        projectId: project.id,
        sceneId,
        text,
        adapter: macOsSayAdapter.id,
        voice: project.render.voice,
        rate: project.render.rate,
      }),
    )
    .digest('hex');
  const outputPath = resolve(voicePreviewDir, `${key}.aiff`);
  const cacheHit = existsSync(outputPath) && statSync(outputPath).size > 0;

  if (!cacheHit) {
    mkdirSync(voicePreviewDir, { recursive: true });
    const temporaryPath = resolve(voicePreviewDir, `${key}-${process.pid}.tmp.aiff`);
    await macOsSayAdapter.generate({
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
    adapter: macOsSayAdapter.id,
    href: `/api/workbench/voice-preview?key=${key}`,
  };
}

export function readVoicePreview(key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) return null;
  const path = resolve(voicePreviewDir, `${key}.aiff`);
  if (!existsSync(path) || statSync(path).size === 0) return null;
  return readFileSync(path);
}
