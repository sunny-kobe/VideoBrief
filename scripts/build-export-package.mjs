import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith('--')) continue;
  const [key, inlineValue] = arg.slice(2).split('=');
  const value = inlineValue ?? process.argv[index + 1];
  args.set(key, value);
  if (inlineValue == null) index += 1;
}

function characterWidth(character) {
  return /^[\x00-\x7F]$/.test(character) ? 0.55 : 1;
}

function wrapCoverTitle(value, maxWidth) {
  const lines = [];
  let line = '';
  let width = 0;
  for (const character of Array.from(String(value).trim())) {
    const nextWidth = characterWidth(character);
    if (line && width + nextWidth > maxWidth) {
      lines.push(line.trim());
      line = character.trimStart();
      width = line ? nextWidth : 0;
    } else {
      line += character;
      width += nextWidth;
    }
  }
  if (line) lines.push(line.trim());
  return lines.slice(0, 3).join('\n');
}

function filterPath(value) {
  return value.replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "\\'");
}

const briefPath = resolve(args.get('brief') ?? 'content/projects/codex-app-explainer/project.json');
const projectText = readFileSync(briefPath, 'utf8');
const project = JSON.parse(projectText);
const manifestPath = resolve(project.outputs.workDir, 'render-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!manifest.proof?.passed) throw new Error('Cannot build export package before technical proof passes.');

const exportDir = resolve(project.outputs.exportDir ?? `output/exports/${project.id}`);
const zipPath = resolve(`${exportDir}.zip`);
mkdirSync(exportDir, { recursive: true });

const finalVideo = resolve(exportDir, 'final.mp4');
const subtitlesSrt = resolve(exportDir, 'subtitles.srt');
const subtitlesAss = resolve(exportDir, 'subtitles.ass');
const coverImage = resolve(exportDir, 'cover.png');
const platformCopy = resolve(exportDir, 'platform-copy.json');
const sourceList = resolve(exportDir, 'source-list.json');
const projectSnapshot = resolve(exportDir, 'project.snapshot.json');
const renderManifest = resolve(exportDir, 'render-manifest.json');
const exportManifestPath = resolve(exportDir, 'export-manifest.json');

copyFileSync(manifest.artifacts.publicRender ?? manifest.artifacts.outputVideo, finalVideo);
copyFileSync(manifest.artifacts.srt, subtitlesSrt);
copyFileSync(manifest.artifacts.subtitles, subtitlesAss);

if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path.');
const coverTitle = project.platformCopy?.coverTitle || project.brief?.coreMessage || project.title;
const coverTitlePath = resolve(exportDir, '.cover-title.txt');
const coverTitleWidth = project.render?.width > project.render?.height ? 18 : 11;
const horizontalCover = (project.render?.width ?? 1080) > (project.render?.height ?? 1920);
const coverFontSize = Math.round(Math.min(project.render?.width ?? 1080, project.render?.height ?? 1920) * 0.056);
writeFileSync(coverTitlePath, `${wrapCoverTitle(coverTitle, coverTitleWidth)}\n`);
const coverDrawText = [
  `drawtext=fontfile='${filterPath('/System/Library/Fonts/Hiragino Sans GB.ttc')}'`,
  `textfile='${filterPath(coverTitlePath)}'`,
  `fontsize=${coverFontSize}`,
  'fontcolor=white',
  'line_spacing=16',
  'borderw=2',
  'bordercolor=black@0.45',
  'x=(w-text_w)/2',
  `y=h*${horizontalCover ? '0.61' : '0.55'}`,
].join(':');
const coverFilter = [
  `drawbox=x=0:y=ih*${horizontalCover ? '0.54' : '0.49'}:w=iw:h=ih*${horizontalCover ? '0.34' : '0.25'}:color=black@0.72:t=fill`,
  coverDrawText,
].join(',');
const coverResult = spawnSync(
  ffmpegPath,
  ['-y', '-ss', '0.1', '-i', finalVideo, '-vf', coverFilter, '-frames:v', '1', '-update', '1', coverImage],
  { encoding: 'utf8' },
);
rmSync(coverTitlePath, { force: true });
if (coverResult.status !== 0 || !existsSync(coverImage)) {
  const details = String(coverResult.stderr || coverResult.stdout || coverResult.error?.message || '')
    .split('\n').map((line) => line.trim()).filter(Boolean).slice(-8).join('\n');
  throw new Error(`Failed to generate cover image${details ? `:\n${details}` : '.'}`);
}

const copyPayload = {
  coverTitle,
  title: project.platformCopy?.title || project.title,
  description: project.platformCopy?.description || project.brief?.objective || '',
  hashtags: project.platformCopy?.hashtags ?? [],
  generatedByAi: project.ai?.calls?.some(
    (call) => call.purpose === 'production-assets' && call.status === 'completed',
  ) ?? false,
};
writeFileSync(platformCopy, `${JSON.stringify(copyPayload, null, 2)}\n`);

const sourcesPayload = project.sources.map((source) => ({
  id: source.id,
  label: source.label,
  sourceType: source.sourceType,
  originalFileName: source.originalFileName ?? '',
  originUrl: source.originUrl,
  assetPath: source.assetPath,
  verificationStatus: source.verificationStatus,
  rightsStatus: source.rightsStatus,
  rightsNote: source.rightsNote,
  contentHash: source.contentHash ?? source.processing?.inputHash ?? '',
  reusedFrom: source.reusedFrom ?? null,
  processingStatus: source.processing?.status ?? 'legacy',
  facts: source.analysis?.facts ?? [],
  uncertainties: source.analysis?.uncertainties ?? [],
}));
writeFileSync(sourceList, `${JSON.stringify(sourcesPayload, null, 2)}\n`);
writeFileSync(projectSnapshot, projectText);

const usedSourceIds = new Set(project.scenes.filter((scene) => scene.enabled !== false).map((scene) => scene.sourceId));
const usedSources = project.sources.filter((source) => usedSourceIds.has(source.id));
const rightsIssues = usedSources
  .filter((source) => source.rightsStatus !== 'cleared')
  .map((source) => `${source.id}: rightsStatus=${source.rightsStatus}`);
const rightsCheck = {
  passed: rightsIssues.length === 0,
  checkedAt: new Date().toISOString(),
  issues: rightsIssues,
  usedSourceIds: [...usedSourceIds],
};
const projectRightsStatus = project.sources.some((source) => source.rightsStatus === 'blocked')
  ? 'blocked'
  : project.sources.length > 0 && project.sources.every((source) => source.rightsStatus === 'cleared')
    ? 'cleared'
    : 'review_required';
const statuses = {
  technical_status: project.technical_status || (manifest.proof?.passed ? 'passed' : 'unverified'),
  rights_status: project.rights_status || projectRightsStatus,
  publication_status: project.publication_status || 'draft-unpublished',
  market_status: project.market_status || 'none',
};

const enhancedManifest = {
  ...manifest,
  artifacts: {
    ...manifest.artifacts,
    coverImage,
    platformCopy,
    sourceList,
    projectSnapshot,
    exportManifest: exportManifestPath,
  },
  rightsCheck,
  statuses,
  production: {
    ...(project.production ?? {}),
    userEditedSceneCount: project.scenes.filter((scene) => scene.userEdited === true).length,
    sourceProcessingFailureCount: project.sources.filter((source) => source.processing?.status === 'failed').length,
    aiFailureCount: project.ai?.calls?.filter((call) => call.status === 'failed').length ?? 0,
  },
};
const temporaryManifestPath = `${manifestPath}.tmp`;
writeFileSync(temporaryManifestPath, `${JSON.stringify(enhancedManifest, null, 2)}\n`);
renameSync(temporaryManifestPath, manifestPath);
writeFileSync(renderManifest, `${JSON.stringify(enhancedManifest, null, 2)}\n`);

const exportManifest = {
  schemaVersion: 1,
  projectId: project.id,
  projectFingerprint: createHash('sha256').update(projectText).digest('hex'),
  createdAt: new Date().toISOString(),
  technicalProof: enhancedManifest.proof,
  rightsCheck,
  production: enhancedManifest.production,
  statuses,
  artifacts: {
    finalVideo,
    subtitlesSrt,
    subtitlesAss,
    coverImage,
    platformCopy,
    sourceList,
    renderManifest,
    projectSnapshot,
  },
};
writeFileSync(exportManifestPath, `${JSON.stringify(exportManifest, null, 2)}\n`);

if (existsSync(zipPath)) {
  const remove = spawnSync('/bin/rm', ['-f', zipPath]);
  if (remove.status !== 0) throw new Error(`Failed to replace ${zipPath}`);
}
const zip = spawnSync('/usr/bin/zip', ['-q', '-r', zipPath, basename(exportDir)], {
  cwd: resolve(exportDir, '..'),
  encoding: 'utf8',
});
if (zip.status !== 0) throw new Error(`Failed to create export zip: ${zip.stderr}`);

console.log(JSON.stringify({ exportDir, zipPath, rightsCheck, artifacts: exportManifest.artifacts }, null, 2));
