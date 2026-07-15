import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export const LOCAL_TRANSCRIPTION_PROMPT_VERSION = 'videobrief-local-whisper-v1';
export const DEFAULT_LOCAL_WHISPER_MODEL_NAME = 'large-v3-turbo-q5_0';

export interface LocalTranscriptSegment {
  start: number;
  end: number;
  text: string;
}

function isExecutable(path: string) {
  return spawnSync('/bin/test', ['-x', path]).status === 0;
}

function resolveCliPath(configuredPath: string) {
  const candidates = [
    configuredPath,
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli',
  ].filter(Boolean);
  return candidates.find(isExecutable) || configuredPath || 'whisper-cli';
}

export function readLocalTranscriptionConfig() {
  const modelName = process.env.WHISPER_MODEL_NAME?.trim() || DEFAULT_LOCAL_WHISPER_MODEL_NAME;
  const modelPath = join(
    /* turbopackIgnore: true */ process.cwd(),
    'output',
    'models',
    'whisper',
    `ggml-${modelName}.bin`,
  );
  const cliPath = resolveCliPath(process.env.WHISPER_CLI_PATH?.trim() || '');
  const cliCheck = spawnSync('/bin/test', ['-x', cliPath]);
  const modelCheck = spawnSync('/bin/test', ['-s', modelPath]);
  const cliAvailable = cliCheck.status === 0;
  const modelAvailable = modelCheck.status === 0;
  return {
    provider: 'local-whisper' as const,
    cliPath,
    modelPath,
    modelName,
    model: `whisper.cpp:${modelName}`,
    language: process.env.WHISPER_LANGUAGE?.trim() || 'zh',
    threads: Math.max(1, Number.parseInt(process.env.WHISPER_THREADS ?? '8', 10) || 8),
    cliAvailable,
    modelAvailable,
    available: cliAvailable && modelAvailable,
  };
}

export function transcribeAudioLocally(audioPath: string, inputHash: string, prompt: string) {
  const config = readLocalTranscriptionConfig();
  if (!config.available) {
    throw new Error(`本地 Whisper 不可用：${config.cliPath} / ${config.modelPath}`);
  }
  const scriptPath = join(
    /* turbopackIgnore: true */ process.cwd(),
    'scripts',
    'transcribe-local-whisper.mjs',
  );
  const result = spawnSync('/usr/bin/env', [process.execPath, scriptPath], {
    encoding: 'utf8',
    input: JSON.stringify({ audioPath, inputHash, prompt }),
    maxBuffer: 4 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
    env: {
      ...process.env,
      WHISPER_CLI_PATH: config.cliPath,
      WHISPER_MODEL_NAME: config.modelName,
      WHISPER_LANGUAGE: config.language,
      WHISPER_THREADS: String(config.threads),
    },
  });
  if (result.status !== 0) {
    const details = String(result.stderr || result.stdout || result.error?.message || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-8)
      .join('\n');
    throw new Error(`本地 Whisper 转录失败${details ? `：${details}` : ''}`);
  }
  const output = JSON.parse(result.stdout) as {
    text: string;
    segments: LocalTranscriptSegment[];
    model: string;
    promptVersion: string;
    inputHash: string;
    cacheHit: boolean;
  };
  if (!output.text?.trim() || !Array.isArray(output.segments)) {
    throw new Error('本地 Whisper 返回了无效结果。');
  }
  return output;
}
