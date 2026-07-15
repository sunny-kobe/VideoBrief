import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const modelPath = resolve(
  process.cwd(),
  'output/models/whisper/ggml-large-v3-turbo-q5_0.bin',
);
const modelUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin?download=true';
const expectedSha256 = '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2';

function fileSha256(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const input = createReadStream(path);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolveHash(hash.digest('hex')));
  });
}

const which = spawnSync('/usr/bin/which', ['whisper-cli'], { encoding: 'utf8' });
if (which.status !== 0) {
  throw new Error('whisper-cli 未安装。macOS 请先运行：brew install whisper-cpp');
}

if (existsSync(modelPath) && await fileSha256(modelPath) === expectedSha256) {
  console.log(`Local Whisper is ready: ${modelPath}`);
  process.exit(0);
}

mkdirSync(dirname(modelPath), { recursive: true });
const temporaryPath = `${modelPath}.download`;
rmSync(temporaryPath, { force: true });
const download = spawnSync('/usr/bin/curl', [
  '--http1.1',
  '-L',
  '--fail',
  '--retry', '5',
  '--retry-all-errors',
  '--connect-timeout', '20',
  '-A', 'Mozilla/5.0',
  '--progress-bar',
  '-o', temporaryPath,
  modelUrl,
], { stdio: 'inherit' });
if (download.status !== 0) {
  rmSync(temporaryPath, { force: true });
  throw new Error('本地 Whisper 模型下载失败。');
}
const actualSha256 = await fileSha256(temporaryPath);
if (actualSha256 !== expectedSha256) {
  rmSync(temporaryPath, { force: true });
  throw new Error(`Whisper 模型 SHA-256 不匹配：${actualSha256}`);
}
renameSync(temporaryPath, modelPath);
console.log(`Local Whisper is ready: ${modelPath}`);
