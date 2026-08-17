import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { exactFrameExtractionArgs } from './lib/frame-extraction.mjs';
import { parseCliArgs } from './lib/cli-args.mjs';
import { verifyNarrationTranscript } from './lib/narration-verification.mjs';
import { validateRenderPlan } from './lib/render-plan-validation.mjs';
import { validateRenderedDuration } from './lib/video-duration-contract.mjs';
import { validateChapterFingerprintManifest } from './lib/chapter-fingerprints.mjs';
import { productionContentFingerprint } from './lib/production-content-fingerprint.mjs';
import { inspectNarrationTailGaps } from './lib/narration-tail-validation.mjs';

const { args } = parseCliArgs(process.argv.slice(2));

const manifestPath = resolve(
  args.get('manifest') ?? 'output/videos/codex-app-explainer-work/render-manifest.json',
);
const proofProcessStartedAt = new Date();

if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path.');
if (!existsSync(manifestPath)) throw new Error(`Render manifest not found: ${manifestPath}`);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const input = resolve(manifest.artifacts?.publicRender ?? manifest.artifacts?.outputVideo ?? '');
const proofDir = args.get('proof-dir')
  ? resolve(args.get('proof-dir'))
  : resolve(dirname(manifestPath), 'proof');
const issues = [];
const proofFrames = [];
const quality = {
  integratedLufs: null,
  truePeakDbtp: null,
  blackSegments: [],
  freezeIntervals: [],
  narrationTailGaps: [],
  warnings: [],
  durationContract: null,
};
let projectMatchesManifest = false;
let canonicalProject = null;
let narrationVerification = null;
let parsedRenderPlan = null;

function fileSha256Stream(path) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', rejectHash);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

function pendingAcceptance(videoSha256) {
  return {
    videoSha256,
    semantic: {
      status: 'pending',
      checkedAt: '',
      reviewer: '',
      issues: [],
      scenes: [],
    },
    browser: {
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
    },
  };
}

function writeProofResult(passed) {
  const videoSha256 = input && existsSync(input)
    ? createHash('sha256').update(readFileSync(input)).digest('hex')
    : '';
  const acceptance = passed
    && manifest.acceptance?.videoSha256 === videoSha256
    ? manifest.acceptance
    : pendingAcceptance(videoSha256);
  let next = {
    ...manifest,
    proof: {
      passed,
      checkedAt: new Date().toISOString(),
      issues,
      frames: proofFrames,
      quality,
      ...(narrationVerification ? { narration: narrationVerification } : {}),
    },
    acceptance,
    productionMetrics: {
      ...(manifest.productionMetrics ?? {}),
      stages: {
        ...(manifest.productionMetrics?.stages ?? {}),
        technicalProof: {
          startedAt: proofProcessStartedAt.toISOString(),
          completedAt: new Date().toISOString(),
          wallMs: Date.now() - proofProcessStartedAt.getTime(),
        },
      },
    },
  };
  if (projectMatchesManifest && manifest.briefPath && existsSync(manifest.briefPath)) {
    const project = JSON.parse(readFileSync(manifest.briefPath, 'utf8'));
    const previousTechnicalStatus = project.technical_status;
    const completedAt = new Date().toISOString();
    project.technical_status = passed ? 'passed' : 'failed';
    project.rights_status = project.rights_status || (
      project.sources?.some((source) => source.rightsStatus === 'blocked')
        ? 'blocked'
        : project.sources?.length > 0 && project.sources.every((source) => source.rightsStatus === 'cleared')
          ? 'cleared'
          : 'review_required'
    );
    project.publication_status = project.publication_status || 'draft-unpublished';
    project.market_status = project.market_status || 'none';
    if (passed && previousTechnicalStatus !== 'passed') {
      project.production = {
        ...(project.production ?? {}),
        updatedAt: completedAt,
        firstRenderCompletedAt: project.production?.firstRenderCompletedAt || completedAt,
        lastRenderCompletedAt: completedAt,
      };
    }
    const projectText = `${JSON.stringify(project, null, 2)}\n`;
    const temporaryProjectPath = `${manifest.briefPath}.tmp`;
    writeFileSync(temporaryProjectPath, projectText);
    renameSync(temporaryProjectPath, manifest.briefPath);
    next = {
      ...next,
      projectFingerprint: createHash('sha256').update(projectText).digest('hex'),
      productionContentFingerprint: productionContentFingerprint(project),
      statuses: {
        technical_status: project.technical_status,
        rights_status: project.rights_status,
        publication_status: project.publication_status,
        market_status: project.market_status,
      },
    };
  }
  const temporaryPath = `${manifestPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(temporaryPath, manifestPath);
}

function timestampSeconds(value) {
  const match = value.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function decodedStreamDuration(map, mediaFlags) {
  const result = spawnSync(
    ffmpegPath,
    ['-hide_banner', '-i', input, '-map', map, ...mediaFlags, '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const matches = [...text.matchAll(/time=(\d+:\d+:\d+(?:\.\d+)?)/g)];
  return matches.length ? timestampSeconds(matches.at(-1)[1]) : null;
}

function verifyVoiceoverNarration() {
  const voiceoverPath = manifest.artifacts?.voiceover;
  if (!voiceoverPath || !existsSync(voiceoverPath) || !canonicalProject) return;
  const expectedText = (canonicalProject.scenes ?? [])
    .filter((scene) => scene.enabled !== false)
    .map((scene) => String(scene.narration ?? scene.subtitle ?? '').trim())
    .filter(Boolean)
    .join(' ');
  if (!expectedText) {
    issues.push('Canonical project has no narration to verify.');
    return;
  }
  const wavPath = resolve(proofDir, 'voiceover-asr.wav');
  const conversion = spawnSync(ffmpegPath, [
    '-y', '-v', 'error', '-i', voiceoverPath, '-vn', '-ar', '16000', '-ac', '1', wavPath,
  ], { encoding: 'utf8' });
  if (conversion.status !== 0 || !existsSync(wavPath) || statSync(wavPath).size === 0) {
    issues.push(`Could not prepare voiceover for reverse transcription: ${conversion.stderr || 'unknown error'}`);
    return;
  }
  if (!process.env.WHISPER_CLI_PATH && existsSync(resolve('.env.local'))) {
    process.loadEnvFile(resolve('.env.local'));
  }
  const inputHash = createHash('sha256').update(readFileSync(voiceoverPath)).digest('hex');
  const transcription = spawnSync(process.execPath, [resolve('scripts/transcribe-local-whisper.mjs')], {
    cwd: process.cwd(),
    encoding: 'utf8',
    input: JSON.stringify({
      audioPath: wavPath,
      inputHash,
      prompt: `SylphxAI pdf-reader-mcp Agent Document Twin read_pdf pdf_evidence OCR trust report MCP server ${expectedText}`,
    }),
    maxBuffer: 4 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
    env: process.env,
  });
  if (transcription.status !== 0) {
    const details = String(transcription.stderr || transcription.stdout || transcription.error?.message || '')
      .split('\n').map((line) => line.trim()).filter(Boolean).slice(-8).join('\n');
    issues.push(`Voiceover reverse transcription failed${details ? `: ${details}` : '.'}`);
    return;
  }
  let result;
  try {
    result = JSON.parse(transcription.stdout);
  } catch {
    issues.push('Voiceover reverse transcription returned invalid JSON.');
    return;
  }
  const pronunciationTerms = (canonicalProject.render?.pronunciations ?? [])
    .map((entry) => ({
      term: String(entry?.term ?? '').trim(),
      aliases: Array.isArray(entry?.asrAliases) ? entry.asrAliases : [],
    }))
    .filter((entry) => entry.term);
  const assessment = verifyNarrationTranscript(expectedText, result.text ?? '', pronunciationTerms);
  const transcriptPath = resolve(proofDir, 'voiceover-transcription.json');
  narrationVerification = {
    passed: assessment.passed,
    checkedAt: new Date().toISOString(),
    provider: result.provider ?? 'local-whisper',
    model: result.model ?? '',
    expectedTextSha256: createHash('sha256').update(expectedText).digest('hex'),
    transcript: result.text ?? '',
    transcriptPath,
    similarity: assessment.similarity,
    lengthRatio: assessment.lengthRatio,
    termChecks: assessment.termChecks,
    warnings: assessment.warnings,
  };
  writeFileSync(transcriptPath, `${JSON.stringify({
    ...narrationVerification,
    expectedText,
    segments: result.segments ?? [],
    cacheHit: result.cacheHit === true,
  }, null, 2)}\n`);
  if (!assessment.passed) {
    issues.push(
      `Voiceover transcript does not match the canonical narration: similarity=${assessment.similarity.toFixed(3)}, lengthRatio=${assessment.lengthRatio.toFixed(3)}.`,
    );
  }
}

if (!input || !existsSync(input)) issues.push(`Rendered video not found: ${input || 'missing path'}.`);

for (const [name, path] of Object.entries(manifest.artifacts ?? {})) {
  if (path && (!existsSync(path) || statSync(path).size === 0)) {
    issues.push(`Artifact ${name} is missing or empty: ${path}.`);
  }
}

const renderPlanPath = manifest.artifacts?.renderPlan;
if (Number(manifest.renderContractVersion ?? 1) >= 2 && !renderPlanPath) {
  issues.push('Render contract version 2 requires a render plan artifact.');
}
if (renderPlanPath && existsSync(renderPlanPath) && statSync(renderPlanPath).size > 0) {
  const renderPlanText = readFileSync(renderPlanPath, 'utf8');
  const renderPlanSha256 = createHash('sha256').update(renderPlanText).digest('hex');
  if (renderPlanSha256 !== manifest.renderPlanSha256) {
    issues.push('Render plan bytes do not match the manifest hash.');
  }
  try {
    const renderPlan = JSON.parse(renderPlanText);
    parsedRenderPlan = renderPlan;
    issues.push(...validateRenderPlan(renderPlan, manifest));
    if (renderPlan.schemaVersion === 3 && renderPlan.strategy === 'segmented-concat') {
      const segmentListPath = String(renderPlan.concat?.listPath ?? '');
      if (!segmentListPath || !existsSync(segmentListPath) || statSync(segmentListPath).size === 0) {
        issues.push(`Render plan segment list is missing or empty: ${segmentListPath || 'missing path'}.`);
      } else if (await fileSha256Stream(segmentListPath) !== renderPlan.concat?.listSha256) {
        issues.push('Render plan segment list bytes changed after render.');
      }
      for (const scene of Array.isArray(renderPlan.scenes) ? renderPlan.scenes : []) {
        const segmentPath = String(scene?.segmentPath ?? '');
        if (!segmentPath || !existsSync(segmentPath) || statSync(segmentPath).size === 0) {
          issues.push(`Render plan scene segment is missing or empty: ${scene?.id ?? (segmentPath || 'unknown')}.`);
          continue;
        }
        if (await fileSha256Stream(segmentPath) !== scene.segmentSha256) {
          issues.push(`Render plan scene ${scene.id} segment bytes changed after render.`);
        }
      }
    }
    for (const sourceInput of Array.isArray(renderPlan.inputs) ? renderPlan.inputs : []) {
      const sourcePath = String(sourceInput?.resolvedPath ?? '');
      if (!sourcePath || !existsSync(sourcePath) || statSync(sourcePath).size === 0) {
        issues.push(`Render plan source is missing or empty: ${sourcePath || sourceInput?.sourceId || 'unknown'}.`);
        continue;
      }
      const actualSha256 = await fileSha256Stream(sourcePath);
      if (actualSha256 !== sourceInput.contentSha256) {
        issues.push(`Render plan source bytes changed after render: ${sourceInput.sourceId ?? sourcePath}.`);
      }
    }
  } catch {
    issues.push('Render plan is not valid JSON.');
  }
} else if (Number(manifest.renderContractVersion ?? 1) >= 2 && renderPlanPath) {
  issues.push('Render contract version 2 render plan is missing or empty.');
}

if (manifest.briefPath && existsSync(manifest.briefPath)) {
  const projectBytes = readFileSync(manifest.briefPath);
  const fingerprint = createHash('sha256').update(projectBytes).digest('hex');
  const parsedProject = JSON.parse(projectBytes.toString('utf8'));
  const contentFingerprint = productionContentFingerprint(parsedProject);
  const projectMatches = manifest.productionContentFingerprint
    ? contentFingerprint === manifest.productionContentFingerprint
    : fingerprint === manifest.projectFingerprint;
  if (!projectMatches) {
    issues.push('Project file changed after render; the MP4 is stale.');
  } else {
    projectMatchesManifest = true;
    canonicalProject = parsedProject;
  }
} else {
  issues.push(`Project file not found: ${manifest.briefPath ?? 'missing path'}.`);
}

if (canonicalProject && Number(canonicalProject.brief?.targetDurationSeconds) >= 180) {
  if (!parsedRenderPlan) {
    issues.push('Long-form technical proof cannot validate chapter fingerprints without a render plan.');
  } else {
    issues.push(...validateChapterFingerprintManifest({
      project: canonicalProject,
      renderPlan: parsedRenderPlan,
      manifest,
    }));
  }
}

const timelinePath = manifest.artifacts?.timeline;
if (issues.length === 0 && timelinePath && existsSync(timelinePath)) {
  try {
    const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
    const narrationTailReview = inspectNarrationTailGaps(timeline.scenes);
    quality.narrationTailGaps = narrationTailReview.checks;
    for (const gap of narrationTailReview.excessive) {
      issues.push(
        `Scene ${gap.sceneId || 'unknown'} leaves ${gap.tailSeconds.toFixed(2)}s after narration; `
        + `the maximum allowed tail is ${gap.maximumTailSeconds.toFixed(2)}s.`,
      );
    }
  } catch (error) {
    issues.push(`Could not validate per-scene narration tails: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (issues.length === 0) {
  mkdirSync(proofDir, { recursive: true });
  const probe = spawnSync(ffmpegPath, ['-hide_banner', '-i', input], { encoding: 'utf8' });
  const probeText = `${probe.stdout ?? ''}\n${probe.stderr ?? ''}`;
  const durationMatch = probeText.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  const resolutionMatch = probeText.match(/Video:.*?(\d{3,5})x(\d{3,5})/);
  const fpsMatch = probeText.match(/,\s*([\d.]+)\s*fps,/);
  const hasAudio = /Audio:/.test(probeText);

  if (!durationMatch || !resolutionMatch) {
    issues.push('Could not read video duration or resolution.');
  } else {
    const [, hours, minutes, seconds] = durationMatch;
    const durationSeconds = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
    const width = Number(resolutionMatch[1]);
    const height = Number(resolutionMatch[2]);
    const fps = fpsMatch ? Number(fpsMatch[1]) : null;
    const expected = manifest.render;
    const durationContract = validateRenderedDuration(
      canonicalProject?.brief?.targetDurationSeconds,
      durationSeconds,
    );
    issues.push(...durationContract.issues);
    quality.durationContract = durationContract;

    if (width !== expected.width || height !== expected.height) {
      issues.push(`Expected ${expected.width}x${expected.height}, got ${width}x${height}.`);
    }
    if (Math.abs(durationSeconds - expected.duration) > 0.35) {
      issues.push(
        `Expected ${expected.duration.toFixed(2)}s from the render manifest, got ${durationSeconds.toFixed(2)}s.`,
      );
    }
    if (fps !== null && Math.abs(fps - expected.fps) > 0.1) {
      issues.push(`Expected ${expected.fps}fps, got ${fps}fps.`);
    }
    if (!hasAudio) issues.push('Expected an audio stream, but none was found.');

    const videoDuration = decodedStreamDuration('0:v:0', ['-an']);
    const audioDuration = hasAudio ? decodedStreamDuration('0:a:0', ['-vn']) : null;
    if (videoDuration == null) {
      issues.push('Could not decode the video stream duration.');
    } else if (Math.abs(videoDuration - expected.duration) > 0.35) {
      issues.push(
        `Video stream is ${videoDuration.toFixed(2)}s; expected ${expected.duration.toFixed(2)}s.`,
      );
    }
    if (hasAudio && audioDuration == null) {
      issues.push('Could not decode the audio stream duration.');
    } else if (audioDuration != null && Math.abs(audioDuration - expected.duration) > 0.35) {
      issues.push(
        `Audio stream is ${audioDuration.toFixed(2)}s; expected ${expected.duration.toFixed(2)}s.`,
      );
    }
    if (
      videoDuration != null &&
      audioDuration != null &&
      Math.abs(videoDuration - audioDuration) > 0.2
    ) {
      issues.push(
        `Audio/video duration mismatch: video=${videoDuration.toFixed(2)}s, audio=${audioDuration.toFixed(2)}s.`,
      );
    }

    if (hasAudio) {
      const volumeProbe = spawnSync(
        ffmpegPath,
        ['-hide_banner', '-i', input, '-af', 'volumedetect', '-f', 'null', '-'],
        { encoding: 'utf8' },
      );
      const volumeText = `${volumeProbe.stdout ?? ''}\n${volumeProbe.stderr ?? ''}`;
      const meanVolumeMatch = volumeText.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
      if (!meanVolumeMatch) {
        issues.push('Could not verify audio level with volumedetect.');
      } else if (Number(meanVolumeMatch[1]) < -55) {
        issues.push(`Audio stream appears too quiet: mean_volume=${meanVolumeMatch[1]} dB.`);
      }

      const loudnessProbe = spawnSync(
        ffmpegPath,
        ['-hide_banner', '-nostats', '-i', input, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'],
        { encoding: 'utf8' },
      );
      const loudnessText = `${loudnessProbe.stdout ?? ''}\n${loudnessProbe.stderr ?? ''}`;
      const integratedMatches = [...loudnessText.matchAll(/\n\s*I:\s*(-?[\d.]+)\s*LUFS/g)];
      const peakMatches = [...loudnessText.matchAll(/\n\s*Peak:\s*(-?[\d.]+)\s*dBFS/g)];
      quality.integratedLufs = integratedMatches.length ? Number(integratedMatches.at(-1)[1]) : null;
      quality.truePeakDbtp = peakMatches.length ? Number(peakMatches.at(-1)[1]) : null;
      if (quality.integratedLufs == null) {
        issues.push('Could not measure integrated loudness.');
      } else if (quality.integratedLufs < -17 || quality.integratedLufs > -15) {
        issues.push(`Integrated loudness ${quality.integratedLufs.toFixed(1)} LUFS is outside the -16 +/- 1 LUFS target.`);
      }
      if (quality.truePeakDbtp == null) {
        issues.push('Could not measure true peak.');
      } else if (quality.truePeakDbtp > -1.45) {
        issues.push(`True peak ${quality.truePeakDbtp.toFixed(1)} dBTP exceeds the -1.5 dBTP target.`);
      }
    }

    const blackProbe = spawnSync(
      ffmpegPath,
      ['-hide_banner', '-nostats', '-i', input, '-vf', 'blackdetect=d=0.5:pix_th=0.10', '-an', '-f', 'null', '-'],
      { encoding: 'utf8' },
    );
    const blackText = `${blackProbe.stdout ?? ''}\n${blackProbe.stderr ?? ''}`;
    quality.blackSegments = [...blackText.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)]
      .map((match) => ({ start: Number(match[1]), end: Number(match[2]), duration: Number(match[3]) }));
    for (const segment of quality.blackSegments) {
      issues.push(`Black frame interval ${segment.start.toFixed(2)}-${segment.end.toFixed(2)}s lasts ${segment.duration.toFixed(2)}s.`);
    }

    const freezeProbe = spawnSync(
      ffmpegPath,
      ['-hide_banner', '-nostats', '-i', input, '-vf', 'freezedetect=n=-50dB:d=3', '-an', '-f', 'null', '-'],
      { encoding: 'utf8' },
    );
    const freezeText = `${freezeProbe.stdout ?? ''}\n${freezeProbe.stderr ?? ''}`;
    const freezeStarts = [...freezeText.matchAll(/freeze_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
    const freezeEnds = [...freezeText.matchAll(/freeze_end:\s*([\d.]+)/g)].map((match) => Number(match[1]));
    const freezeDurations = [...freezeText.matchAll(/freeze_duration:\s*([\d.]+)/g)].map((match) => Number(match[1]));
    quality.freezeIntervals = freezeDurations.map((duration, index) => ({
      start: freezeStarts[index] ?? Math.max(0, (freezeEnds[index] ?? duration) - duration),
      end: freezeEnds[index] ?? (freezeStarts[index] ?? 0) + duration,
      duration,
    }));
    if (quality.freezeIntervals.length > 0) {
      quality.warnings.push(`${quality.freezeIntervals.length} interval(s) are visually static for at least 3 seconds; semantic review must confirm they are intentional.`);
    }

    verifyVoiceoverNarration();

    const framePlan = Array.isArray(manifest.scenes) && manifest.scenes.length > 0
      ? manifest.scenes.map((scene) => ({
          label: `${String(scene.id).replace(/[^a-zA-Z0-9_-]/g, '_')}-mid`,
          second: Math.max(0.1, Math.min(durationSeconds - 0.1, (Number(scene.start) + Number(scene.end)) / 2)),
        }))
      : [0.1, 0.3, 0.5, 0.7, 0.9].map((ratio) => ({
          label: `${Math.round(ratio * 100)}pct`,
          second: Math.max(0.1, Math.min(durationSeconds - 0.1, durationSeconds * ratio)),
        }));
    for (const frame of framePlan) {
      const output = resolve(proofDir, `frame-${frame.label}.png`);
      const result = spawnSync(
        ffmpegPath,
        exactFrameExtractionArgs(input, frame.second, output),
        { stdio: 'ignore' },
      );
      if (result.status !== 0 || !existsSync(output) || statSync(output).size === 0) {
        issues.push(`Failed to extract proof frame at ${frame.second.toFixed(2)}s.`);
      } else {
        proofFrames.push(output);
      }
    }
  }
}

writeProofResult(issues.length === 0);

if (issues.length > 0) {
  console.error('Video proof failed:');
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}

console.log(`Video proof passed for ${manifest.projectId}.`);
console.log(`Manifest updated: ${manifestPath}`);
console.log(`Proof frames written to ${proofDir}`);
