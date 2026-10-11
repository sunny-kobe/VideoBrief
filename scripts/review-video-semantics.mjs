import { hashMediaFile } from './lib/hash-media-file.mjs';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { parseCliArgs } from './lib/cli-args.mjs';
import {
  intervalCoverage,
  reviewSessionTargetsArtifact,
  validateEditorialQualityReview,
  validateReviewSession,
  validateSceneReviewNotes,
  validateSemanticReviewRequest,
} from './lib/acceptance-validation.mjs';
import { productionContentFingerprint } from './lib/production-content-fingerprint.mjs';
import { exactFrameExtractionArgs } from './lib/frame-extraction.mjs';
import { extractCachedReviewFrame } from './lib/review-frame-cache.mjs';

const reviewProcessStartedAt = new Date();

const { args } = parseCliArgs(process.argv.slice(2));

const manifestPath = resolve(
  args.get('manifest') ?? 'output/videos/codex-app-explainer-work/render-manifest.json',
);
const decision = args.get('decision') ?? 'pending';
const reviewer = String(args.get('reviewer') ?? '').trim();
const reviewNote = String(args.get('note') ?? '').trim();
const sceneNotesPath = args.get('scene-notes') ? resolve(args.get('scene-notes')) : '';
const qualityReviewPath = args.get('quality-review') ? resolve(args.get('quality-review')) : '';
const sceneNotes = sceneNotesPath && existsSync(sceneNotesPath)
  ? JSON.parse(readFileSync(sceneNotesPath, 'utf8'))
  : {};
const qualityReview = qualityReviewPath && existsSync(qualityReviewPath)
  ? JSON.parse(readFileSync(qualityReviewPath, 'utf8'))
  : null;
if (args.get('scene-notes') && !existsSync(sceneNotesPath)) {
  throw new Error(`Scene review notes not found: ${sceneNotesPath}`);
}
if (args.get('quality-review') && !existsSync(qualityReviewPath)) {
  throw new Error(`Editorial quality review not found: ${qualityReviewPath}`);
}
if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path.');
if (!existsSync(manifestPath)) throw new Error(`Render manifest not found: ${manifestPath}`);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!manifest.proof?.passed) throw new Error('Technical proof must pass before semantic review.');
if (!manifest.briefPath || !existsSync(manifest.briefPath)) {
  throw new Error(`Canonical project not found: ${manifest.briefPath ?? 'missing path'}`);
}
const projectText = readFileSync(manifest.briefPath, 'utf8');
const projectFingerprint = createHash('sha256').update(projectText).digest('hex');
const project = JSON.parse(projectText);
const currentProductionContentFingerprint = productionContentFingerprint(project);
const projectMatches = manifest.productionContentFingerprint
  ? currentProductionContentFingerprint === manifest.productionContentFingerprint
  : projectFingerprint === manifest.projectFingerprint;
if (!projectMatches) {
  throw new Error('Canonical project changed after render; semantic review cannot approve a stale video.');
}
const timelinePath = manifest.artifacts?.timeline;
if (!timelinePath || !existsSync(timelinePath)) throw new Error('Production timeline is missing.');
const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
const videoPath = resolve(manifest.artifacts?.publicRender ?? manifest.artifacts?.outputVideo ?? '');
if (!existsSync(videoPath) || statSync(videoPath).size === 0) throw new Error('Rendered video is missing.');
const videoSha256 = hashMediaFile(videoPath);
if (manifest.acceptance?.videoSha256 && manifest.acceptance.videoSha256 !== videoSha256) {
  throw new Error('Rendered video bytes changed after technical proof.');
}
const reviewSessionPath = resolve(
  args.get('review-session') ?? dirname(manifestPath),
  args.get('review-session') ? '' : 'semantic-review-session.json',
);

if (args.has('start-session')) {
  if (existsSync(reviewSessionPath) && !args.has('restart-session')) {
    const existing = JSON.parse(readFileSync(reviewSessionPath, 'utf8'));
    if (existing.status === 'active' && reviewSessionTargetsArtifact(existing, {
      projectId: manifest.projectId,
      projectFingerprint,
      videoSha256,
    })) {
      throw new Error(`An active semantic review session already exists: ${reviewSessionPath}`);
    }
  }
  const session = {
    schemaVersion: 1,
    status: 'active',
    sessionId: randomUUID(),
    projectId: manifest.projectId,
    projectFingerprint,
    videoSha256,
    startedAt: new Date().toISOString(),
    completedAt: '',
    elapsedSeconds: null,
  };
  const temporarySessionPath = `${reviewSessionPath}.tmp`;
  writeFileSync(temporarySessionPath, `${JSON.stringify(session, null, 2)}\n`);
  renameSync(temporarySessionPath, reviewSessionPath);
  console.log(JSON.stringify({ reviewSessionPath, session }, null, 2));
  process.exit(0);
}

if (args.has('active-seconds')) {
  throw new Error('--active-seconds is no longer accepted; start a system-measured review session first.');
}
let reviewSession = null;
let measuredActiveSeconds = null;
if (decision !== 'pending') {
  if (!existsSync(reviewSessionPath)) {
    throw new Error(`Semantic review session not found: ${reviewSessionPath}`);
  }
  reviewSession = JSON.parse(readFileSync(reviewSessionPath, 'utf8'));
  const sessionValidation = validateReviewSession({
    session: reviewSession,
    projectId: manifest.projectId,
    projectFingerprint,
    videoSha256,
    now: reviewProcessStartedAt.toISOString(),
  });
  if (!sessionValidation.valid) {
    throw new Error(`Invalid semantic review session:\n- ${sessionValidation.issues.join('\n- ')}`);
  }
  measuredActiveSeconds = sessionValidation.activeSeconds;
}

const freezeIntervalCount = manifest.proof?.quality?.freezeIntervals?.length ?? 0;
const pronunciationWarningCount = (manifest.proof?.narration?.termChecks ?? [])
  .filter((check) => check.relevant === true && check.matched !== true).length;
const enabledScenes = project.scenes.filter((scene) => scene.enabled !== false);
const reusableSceneReviews = new Map(
  (manifest.semanticReviewReuse?.reusedSceneReviews ?? []).map((scene) => [scene.sceneId, scene]),
);
const scenesRequiringReview = enabledScenes.filter((scene) => !reusableSceneReviews.has(scene.id));
const hasChapterFingerprints = (manifest.chapterFingerprints?.chapters?.length ?? 0) > 0;
const reviewDurationSeconds = hasChapterFingerprints
  ? Number(manifest.semanticReviewReuse?.changedDurationSeconds ?? manifest.render?.duration)
  : Number(manifest.render?.duration);
const requestValidation = validateSemanticReviewRequest({
  decision,
  reviewer,
  note: reviewNote,
  freezeIntervalCount,
  confirmFreezeWarnings: args.has('confirm-freezes'),
  pronunciationWarningCount,
  confirmPronunciationWarnings: args.has('confirm-pronunciations'),
  sceneCount: scenesRequiringReview.length,
  videoDurationSeconds: Number(manifest.render?.duration),
  reviewDurationSeconds,
  activeSeconds: measuredActiveSeconds,
  activeSecondsSource: decision === 'pending' ? undefined : 'review-session',
});
if (!requestValidation.valid) {
  throw new Error(`Invalid semantic review request:\n- ${requestValidation.issues.join('\n- ')}`);
}
const qualityReviewValidation = validateEditorialQualityReview({ decision, review: qualityReview });
if (!qualityReviewValidation.valid) {
  throw new Error(`Invalid editorial quality review:\n- ${qualityReviewValidation.issues.join('\n- ')}`);
}

const issues = [];
const sceneNoteValidation = validateSceneReviewNotes({
  decision,
  sceneIds: enabledScenes.map((scene) => scene.id),
  requiredSceneIds: scenesRequiringReview.map((scene) => scene.id),
  sceneNotes,
});
if (!sceneNoteValidation.valid) {
  throw new Error(`Invalid per-scene semantic review notes:\n- ${sceneNoteValidation.issues.join('\n- ')}`);
}
const manifestById = new Map((manifest.scenes ?? []).map((scene) => [scene.id, scene]));
const timelineById = new Map((timeline.scenes ?? []).map((scene) => [scene.id, scene]));
const semanticProofDir = resolve(dirname(manifestPath), 'semantic-proof');
mkdirSync(semanticProofDir, { recursive: true });

function sameNumber(left, right) {
  return Number.isFinite(Number(left))
    && Number.isFinite(Number(right))
    && Math.abs(Number(left) - Number(right)) < 0.001;
}

function extractFrame(sceneId, label, second) {
  const output = resolve(semanticProofDir, `${sceneId}-${label}.png`);
  const extractionArgs = exactFrameExtractionArgs(videoPath, Math.max(0.05, second), output);
  const result = extractCachedReviewFrame({
    output,
    videoSha256,
    args: extractionArgs,
    extract: () => spawnSync(ffmpegPath, extractionArgs, { encoding: 'utf8' }),
  });
  if (!result.success) {
    issues.push(`Scene ${sceneId} failed to extract ${label} frame.`);
    return '';
  }
  return output;
}

const sceneReviews = enabledScenes.map((scene) => {
  const reusedReview = reusableSceneReviews.get(scene.id);
  const selected = scene.candidates?.find((candidate) => candidate.id === scene.selectedCandidateId);
  const rendered = manifestById.get(scene.id);
  const timed = timelineById.get(scene.id);
  if (!selected) issues.push(`Scene ${scene.id} has no selected candidate.`);
  if (scene.selectionStatus !== 'codex_reviewed' && scene.selectionStatus !== 'user_approved') {
    issues.push(`Scene ${scene.id} selection is ${scene.selectionStatus || 'unselected'}, not reviewed.`);
  }
  for (const [name, candidate] of [['selected candidate', selected], ['render manifest', rendered], ['timeline', timed]]) {
    if (!candidate) {
      issues.push(`Scene ${scene.id} is missing from ${name}.`);
      continue;
    }
    if (
      candidate.sourceId !== scene.sourceId
      || !sameNumber(candidate.sourceStart, scene.sourceStart)
      || !sameNumber(candidate.sourceEnd, scene.sourceEnd)
    ) {
      issues.push(`Scene ${scene.id} ${name} does not match sourceId/sourceStart/sourceEnd.`);
    }
  }
  const outputStart = Number(timed?.start ?? rendered?.start ?? 0);
  const outputEnd = Number(timed?.end ?? rendered?.end ?? outputStart);
  const frames = [
    extractFrame(scene.id, 'start', Math.min(outputEnd - 0.05, outputStart + 0.12)),
    extractFrame(scene.id, 'mid', outputStart + Math.max(0.12, (outputEnd - outputStart) / 2)),
    extractFrame(scene.id, 'end', Math.max(outputStart + 0.05, outputEnd - 0.12)),
  ].filter(Boolean);
  return {
    sceneId: scene.id,
    status: decision,
    frames,
    note: reusedReview?.note || sceneNoteValidation.notes[scene.id] || (decision === 'pending'
      ? '等待逐句核对旁白、标题、字幕、画面需求和可见内容。'
      : ''),
    ...(reusedReview ? {
      reused: true,
      reusedFromVideoSha256: reusedReview.sourceVideoSha256,
      reusedFromReviewedAt: reusedReview.reviewedAt,
      reusedFromReviewer: reusedReview.reviewer,
    } : {}),
  };
});

if (decision === 'passed' && issues.length > 0) {
  throw new Error(`Semantic review cannot pass:\n- ${issues.join('\n- ')}`);
}
if (decision === 'failed' && reviewNote) issues.push(reviewNote);
const browser = {
  status: 'pending',
  checkedAt: '',
  url: '',
  browser: '',
  viewport: null,
  readyState: null,
  duration: null,
  playedSeconds: null,
  ended: false,
  consoleErrors: [],
  mediaError: '',
  screenshot: '',
  issues: [],
};
const freezeCoverage = intervalCoverage(
  manifest.proof?.quality?.freezeIntervals ?? [],
  Number(manifest.render?.duration),
);
const next = {
  ...manifest,
  acceptance: {
    videoSha256,
    semantic: {
      status: issues.length > 0 && decision === 'passed' ? 'failed' : decision,
      checkedAt: decision === 'pending' ? '' : new Date().toISOString(),
      reviewer: requestValidation.reviewer,
      note: requestValidation.note,
      activeSeconds: requestValidation.activeSeconds,
      activeSecondsSource: decision === 'pending' ? undefined : 'review-session',
      minimumActiveSeconds: requestValidation.minimumActiveSeconds,
      reviewDurationSeconds: requestValidation.reviewDurationSeconds,
      reviewedSceneCount: scenesRequiringReview.length,
      reusedSceneCount: reusableSceneReviews.size,
      reusedChapterIds: manifest.semanticReviewReuse?.reusedChapterIds ?? [],
      invalidatedChapterIds: manifest.semanticReviewReuse?.invalidatedChapterIds ?? [],
      reviewSessionId: reviewSession?.sessionId ?? '',
      reviewSessionPath: decision === 'pending' ? '' : reviewSessionPath,
      reviewSessionStartedAt: reviewSession?.startedAt ?? '',
      processStartedAt: reviewProcessStartedAt.toISOString(),
      processWallMs: Date.now() - reviewProcessStartedAt.getTime(),
      confirmedFreezeWarnings: decision === 'passed' && freezeIntervalCount > 0,
      freezeIntervalCount,
      confirmedPronunciationWarnings: decision === 'passed' && pronunciationWarningCount > 0,
      pronunciationWarningCount,
      editorialQuality: qualityReviewValidation.review
        ? {
            ...qualityReviewValidation.review,
            sourcePath: qualityReviewPath,
            signals: {
              sceneCount: enabledScenes.length,
              reviewedSceneCount: scenesRequiringReview.length,
              reusedSceneCount: reusableSceneReviews.size,
              freezeIntervalCount,
              freezeCoverageSeconds: freezeCoverage.seconds,
              freezeCoverageRatio: freezeCoverage.ratio,
              narrationSimilarity: manifest.proof?.narration?.similarity ?? null,
              unmatchedPronunciationTerms: (manifest.proof?.narration?.termChecks ?? [])
                .filter((check) => check.relevant === true && check.matched !== true)
                .map((check) => check.term),
            },
          }
        : null,
      issues,
      scenes: sceneReviews,
    },
    browser,
  },
};
const temporaryPath = `${manifestPath}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`);
renameSync(temporaryPath, manifestPath);

if (reviewSession && decision !== 'pending') {
  const completedSession = {
    ...reviewSession,
    status: 'completed',
    completedAt: next.acceptance.semantic.checkedAt,
    elapsedSeconds: requestValidation.activeSeconds,
    decision: next.acceptance.semantic.status,
  };
  const temporarySessionPath = `${reviewSessionPath}.tmp`;
  writeFileSync(temporarySessionPath, `${JSON.stringify(completedSession, null, 2)}\n`);
  renameSync(temporarySessionPath, reviewSessionPath);
}

console.log(JSON.stringify({
  projectId: manifest.projectId,
  videoSha256,
  semantic: next.acceptance.semantic,
}, null, 2));
