import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const PIPELINE_STAGE_FILES = [
  'scripts/render-local-short-video-synced.mjs',
  'scripts/proof-video.mjs',
  'scripts/review-video-semantics.mjs',
  'scripts/verify-video-browser.mjs',
  'scripts/build-export-package.mjs',
  'src/voiceoverProvider.mjs',
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function defaultPipelineFiles(root) {
  const libRoot = resolve(root, 'scripts/lib');
  const libraryFiles = existsSync(libRoot)
    ? readdirSync(libRoot)
      .filter((name) => name.endsWith('.mjs'))
      .map((name) => `scripts/lib/${name}`)
    : [];
  return [...new Set([...PIPELINE_STAGE_FILES, ...libraryFiles])].sort();
}

function readGitState(root, files) {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (head.status !== 0) {
    return { available: false, head: '', dirty: null, changedPaths: [] };
  }
  const status = spawnSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all', '--', ...files],
    { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  );
  const changedPaths = status.status === 0
    ? String(status.stdout ?? '')
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
    : [];
  return {
    available: true,
    head: String(head.stdout ?? '').trim(),
    dirty: status.status === 0 ? changedPaths.length > 0 : null,
    changedPaths,
  };
}

export function buildPipelineCodeSnapshot(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const files = [...new Set(options.files ?? defaultPipelineFiles(root))].sort();
  const records = files.map((file) => {
    const absolutePath = resolve(root, file);
    if (!existsSync(absolutePath)) throw new Error(`Pipeline code file is missing: ${file}`);
    const content = readFileSync(absolutePath, 'utf8');
    return {
      path: relative(root, absolutePath).replaceAll('\\', '/'),
      sha256: sha256(content),
      content,
    };
  });
  const fingerprint = sha256(JSON.stringify(records.map(({ path, sha256: fileSha256 }) => ({
    path,
    sha256: fileSha256,
  }))));
  return {
    schemaVersion: 1,
    fingerprint,
    git: readGitState(root, files),
    files: records,
  };
}

export function summarizePipelineCodeSnapshot(snapshot, snapshotSha256 = '') {
  return {
    schemaVersion: snapshot.schemaVersion,
    fingerprint: snapshot.fingerprint,
    snapshotSha256,
    git: snapshot.git,
    files: snapshot.files.map(({ path, sha256: fileSha256 }) => ({ path, sha256: fileSha256 })),
  };
}

export function validatePipelineCodeSnapshot(snapshot) {
  const issues = [];
  if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot?.files) || !snapshot.files.length) {
    return ['Pipeline code snapshot is missing or invalid.'];
  }
  const files = snapshot.files.map((file) => ({
    path: String(file?.path ?? ''),
    sha256: String(file?.sha256 ?? ''),
    content: String(file?.content ?? ''),
  }));
  for (const file of files) {
    if (!file.path || sha256(file.content) !== file.sha256) {
      issues.push(`Pipeline code snapshot file hash does not match: ${file.path || 'unknown'}.`);
    }
  }
  const fingerprint = sha256(JSON.stringify(files.map(({ path, sha256: fileSha256 }) => ({
    path,
    sha256: fileSha256,
  }))));
  if (fingerprint !== snapshot.fingerprint) {
    issues.push('Pipeline code snapshot fingerprint does not match its file list.');
  }
  return issues;
}

export function validateCurrentPipelineCode(manifestPipelineCode, options = {}) {
  if (manifestPipelineCode?.schemaVersion !== 1 || !manifestPipelineCode.fingerprint) {
    return ['Render manifest is missing a pipeline code fingerprint.'];
  }
  const current = buildPipelineCodeSnapshot(options);
  return current.fingerprint === manifestPipelineCode.fingerprint
    ? []
    : ['Pipeline code changed after render; acceptance must use the rendered code snapshot.'];
}
