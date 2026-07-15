import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const promptVersion = 'videobrief-local-whisper-v1';

function compactText(value) {
  return value.trim().replace(/\s+/g, ' ').replace(/\s+([，。！？；：、])/g, '$1');
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (!input.audioPath || !input.inputHash) fail('缺少本地转录输入。');
  const modelName = process.env.WHISPER_MODEL_NAME?.trim() || 'large-v3-turbo-q5_0';
  const model = `whisper.cpp:${modelName}`;
  const modelPath = join(process.cwd(), 'output', 'models', 'whisper', `ggml-${modelName}.bin`);
  const cliPath = process.env.WHISPER_CLI_PATH?.trim() || 'whisper-cli';
  const language = process.env.WHISPER_LANGUAGE?.trim() || 'zh';
  const threads = Math.max(1, Number.parseInt(process.env.WHISPER_THREADS ?? '8', 10) || 8);
  const prompt = typeof input.prompt === 'string' ? input.prompt.slice(0, 500) : '';
  const cacheKey = createHash('sha256').update(JSON.stringify({
    provider: 'local-whisper',
    model,
    promptVersion,
    language,
    inputHash: input.inputHash,
    prompt,
  })).digest('hex');
  const cacheRoot = join(process.cwd(), 'output', 'transcription-cache');
  const cachePath = join(cacheRoot, `${cacheKey}.json`);
  if (existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
    if (cached.text?.trim() && Array.isArray(cached.segments)) {
      process.stdout.write(JSON.stringify({ ...cached, cacheHit: true }));
      process.exit(0);
    }
  }

  mkdirSync(cacheRoot, { recursive: true });
  const outputBase = join(cacheRoot, `whisper-${cacheKey}`);
  const outputPath = `${outputBase}.json`;
  rmSync(outputPath, { force: true });
  const args = [
    '-m', modelPath,
    '-f', input.audioPath,
    '-l', language,
    '-t', String(threads),
    '-oj',
    '-of', outputBase,
    '-np',
  ];
  if (prompt.trim()) args.push('--prompt', prompt);
  const transcription = spawnSync('/usr/bin/env', [cliPath, ...args], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
  });
  if (transcription.status !== 0 || !existsSync(outputPath)) {
    const details = String(
      transcription.stderr || transcription.stdout || transcription.error?.message || '',
    ).split('\n').map((line) => line.trim()).filter(Boolean).slice(-8).join('\n');
    fail(details || 'whisper-cli 没有生成结果。');
  }
  const raw = JSON.parse(readFileSync(outputPath, 'utf8'));
  const segments = (raw.transcription ?? []).flatMap((segment) => {
    const text = compactText(typeof segment.text === 'string' ? segment.text : '');
    if (!text) return [];
    const from = Number(segment.offsets?.from);
    const to = Number(segment.offsets?.to);
    return [{
      start: Number.isFinite(from) ? Math.max(0, from / 1000) : 0,
      end: Number.isFinite(to) ? Math.max(0, to / 1000) : 0,
      text,
    }];
  });
  const text = compactText(segments.map((segment) => segment.text).join(' '));
  rmSync(outputPath, { force: true });
  if (!text) fail(`本地 Whisper 未识别到可用语音：${basename(input.audioPath)}`);
  const output = {
    schemaVersion: 1,
    provider: 'local-whisper',
    model,
    promptVersion,
    language,
    inputHash: input.inputHash,
    text,
    segments,
    cacheHit: false,
  };
  writeFileSync(cachePath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(JSON.stringify(output));
} catch (error) {
  fail(error instanceof Error ? error.message : '本地 Whisper 转录失败。');
}
