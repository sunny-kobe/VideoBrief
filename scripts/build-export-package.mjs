import { createHash } from 'node:crypto';
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { parseCliArgs } from './lib/cli-args.mjs';
import {
  validateBrowserChecks,
  validateSemanticAcceptanceRecord,
} from './lib/acceptance-validation.mjs';
import { buildProductionMetrics } from './lib/production-metrics.mjs';
import {
  packageContentFingerprint,
  productionContentFingerprint,
} from './lib/production-content-fingerprint.mjs';
import {
  assertDeliveryApproved,
  assertPreproductionGates,
} from './lib/production-workflow-contract.mjs';
import { materialInventorySources } from './lib/material-inventory.mjs';
import {
  renditionBundleFingerprint,
  resolveProjectRenditions,
} from './lib/video-renditions.mjs';

const packageProcessStartedAt = new Date();

const { args } = parseCliArgs(process.argv.slice(2));

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
const projectFingerprint = createHash('sha256').update(projectText).digest('hex');
const currentProductionContentFingerprint = productionContentFingerprint(project);
const currentPackageContentFingerprint = packageContentFingerprint(project);
if (resolve(manifest.briefPath ?? '') !== briefPath) {
  throw new Error('Cannot build export package from a manifest that belongs to another project file.');
}
const projectMatches = manifest.productionContentFingerprint
  ? manifest.productionContentFingerprint === currentProductionContentFingerprint
  : manifest.projectFingerprint === projectFingerprint;
if (!projectMatches) {
  throw new Error('Cannot build export package from a stale render; the canonical project changed after rendering.');
}
if (!manifest.proof?.passed) throw new Error('Cannot build export package before technical proof passes.');
assertPreproductionGates(project);
const renderedVideo = resolve(manifest.artifacts.publicRender ?? manifest.artifacts.outputVideo);
const renderedVideoSha256 = createHash('sha256').update(readFileSync(renderedVideo)).digest('hex');
if (manifest.acceptance?.videoSha256 !== renderedVideoSha256) {
  throw new Error('Cannot build export package before acceptance is bound to the current video bytes.');
}
const renditionEvidence = resolveProjectRenditions(project).map((rendition) => {
  const renditionManifestPath = resolve(rendition.workDir, 'render-manifest.json');
  if (!existsSync(renditionManifestPath)) {
    throw new Error(`Cannot build export package because rendition ${rendition.id} has no render manifest.`);
  }
  const renditionManifest = JSON.parse(readFileSync(renditionManifestPath, 'utf8'));
  const renditionVideo = resolve(
    renditionManifest.artifacts?.publicRender ?? renditionManifest.artifacts?.outputVideo ?? '',
  );
  if (!renditionVideo || !existsSync(renditionVideo) || statSync(renditionVideo).size === 0) {
    throw new Error(`Cannot build export package because rendition ${rendition.id} has no rendered video.`);
  }
  const videoSha256 = createHash('sha256').update(readFileSync(renditionVideo)).digest('hex');
  if (renditionManifest.acceptance?.videoSha256 !== videoSha256) {
    throw new Error(`Cannot build export package because rendition ${rendition.id} acceptance is stale.`);
  }
  const renditionSemantic = validateSemanticAcceptanceRecord(renditionManifest.acceptance?.semantic);
  if (!renditionManifest.proof?.passed) {
    throw new Error(`Cannot build export package because rendition ${rendition.id} technical proof is incomplete.`);
  }
  if (!renditionSemantic.passed) {
    throw new Error(
      `Cannot build export package because rendition ${rendition.id} semantic acceptance is incomplete:\n- ${renditionSemantic.issues.join('\n- ')}`,
    );
  }
  const renditionBrowser = validateBrowserChecks(
    renditionManifest.acceptance?.browser?.checks ?? [],
    Number(renditionManifest.render?.duration),
  );
  if (renditionManifest.acceptance?.browser?.status !== 'passed' || !renditionBrowser.passed) {
    throw new Error(`Cannot build export package because rendition ${rendition.id} browser acceptance is incomplete.`);
  }
  return { id: rendition.id, videoSha256 };
});
const deliveryApprovalFingerprint = renditionBundleFingerprint(renditionEvidence);
assertDeliveryApproved(project, deliveryApprovalFingerprint);
const semanticValidation = validateSemanticAcceptanceRecord(manifest.acceptance.semantic);
if (!semanticValidation.passed) {
  throw new Error(`Cannot build export package before measured semantic review passes:\n- ${semanticValidation.issues.join('\n- ')}`);
}
if (manifest.acceptance.browser?.status !== 'passed') {
  throw new Error('Cannot build export package before browser playback acceptance passes.');
}
const browserValidation = validateBrowserChecks(
  manifest.acceptance.browser?.checks ?? [],
  Number(manifest.render?.duration),
);
if (!browserValidation.passed) {
  throw new Error(`Cannot build export package because browser acceptance is incomplete:\n- ${browserValidation.issues.join('\n- ')}`);
}

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
const exportPackageReceiptPath = resolve(`${exportDir}.package.json`);

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

const sourcesPayload = materialInventorySources(project);
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
const metricsCapturedAt = new Date().toISOString();
const productionMetrics = buildProductionMetrics({
  project,
  manifest: {
    ...manifest,
    productionMetrics: {
      ...(manifest.productionMetrics ?? {}),
      stages: {
        ...(manifest.productionMetrics?.stages ?? {}),
        packagingPreparation: {
          startedAt: packageProcessStartedAt.toISOString(),
          completedAt: metricsCapturedAt,
          wallMs: Date.now() - packageProcessStartedAt.getTime(),
        },
      },
    },
  },
  finalizedAt: metricsCapturedAt,
});

const enhancedManifest = {
  ...manifest,
  productionContentFingerprint: currentProductionContentFingerprint,
  packageContentFingerprint: currentPackageContentFingerprint,
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
  productionMetrics,
};
const temporaryManifestPath = `${manifestPath}.tmp`;
writeFileSync(temporaryManifestPath, `${JSON.stringify(enhancedManifest, null, 2)}\n`);
renameSync(temporaryManifestPath, manifestPath);
writeFileSync(renderManifest, `${JSON.stringify(enhancedManifest, null, 2)}\n`);

const exportManifest = {
  schemaVersion: 1,
  projectId: project.id,
  projectFingerprint,
  productionContentFingerprint: currentProductionContentFingerprint,
  packageContentFingerprint: currentPackageContentFingerprint,
  createdAt: new Date().toISOString(),
  technicalProof: enhancedManifest.proof,
  semanticAcceptance: enhancedManifest.acceptance.semantic,
  browserAcceptance: enhancedManifest.acceptance.browser,
  rightsCheck,
  production: enhancedManifest.production,
  productionMetrics,
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

const temporaryZipPath = `${zipPath}.tmp-${process.pid}`;
rmSync(temporaryZipPath, { force: true });
const zip = spawnSync('/usr/bin/zip', ['-q', '-r', temporaryZipPath, basename(exportDir)], {
  cwd: resolve(exportDir, '..'),
  encoding: 'utf8',
});
if (zip.status !== 0) throw new Error(`Failed to create export zip: ${zip.stderr}`);
renameSync(temporaryZipPath, zipPath);

function fileSha256(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const input = createReadStream(path);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolveHash(hash.digest('hex')));
  });
}

const packageReceipt = {
  schemaVersion: 2,
  projectId: project.id,
  projectFingerprint: exportManifest.projectFingerprint,
  productionContentFingerprint: currentProductionContentFingerprint,
  packageContentFingerprint: currentPackageContentFingerprint,
  renderedAt: enhancedManifest.renderedAt,
  renderManifestPath: manifestPath,
  renderManifestSha256: await fileSha256(manifestPath),
  videoPath: manifest.artifacts.publicRender ?? manifest.artifacts.outputVideo,
  videoSha256: await fileSha256(manifest.artifacts.publicRender ?? manifest.artifacts.outputVideo),
  zipPath,
  zipBytes: statSync(zipPath).size,
  zipSha256: await fileSha256(zipPath),
  deliveryApprovalFingerprint,
  deliveryApprovedAt: project.workflow.deliveryApproval.decidedAt,
  deliveryApprovedBy: project.workflow.deliveryApproval.decidedBy,
  createdAt: new Date().toISOString(),
};
const temporaryReceiptPath = `${exportPackageReceiptPath}.tmp`;
writeFileSync(temporaryReceiptPath, `${JSON.stringify(packageReceipt, null, 2)}\n`);
renameSync(temporaryReceiptPath, exportPackageReceiptPath);

console.log(JSON.stringify({
  exportDir,
  zipPath,
  exportPackageReceiptPath,
  rightsCheck,
  artifacts: exportManifest.artifacts,
}, null, 2));
