import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { inspectNarrationTailGaps } from './narration-tail-validation.mjs';
import { productionContentFingerprint } from './production-content-fingerprint.mjs';

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function enabledSceneIds(project) {
  return (project?.scenes ?? [])
    .filter((scene) => scene.enabled !== false)
    .map((scene) => String(scene.id));
}

export function voiceoverPreflightFingerprint({
  project,
  voiceConfig,
  voiceGenerationMode,
  rendition,
}) {
  return hash({
    productionContentFingerprint: productionContentFingerprint(project),
    voiceConfig,
    voiceGenerationMode,
    rendition: {
      id: rendition?.id ?? 'primary',
      width: rendition?.width,
      height: rendition?.height,
      fps: Number(project?.render?.fps ?? 30),
    },
  });
}

export function readVoiceoverPreflight(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function appendVoiceoverPreflightAttempt(previous, fingerprint, attempt) {
  const attempts = Array.isArray(previous?.attempts) ? previous.attempts : [];
  return [...attempts, { fingerprint, ...attempt }].slice(-50);
}

function requestSummary(batches, scenes) {
  const records = batches.length > 0
    ? batches
    : scenes.map((scene) => scene.voiceArtifact).filter(Boolean);
  return {
    recorded: records.length,
    external: records.filter((record) => record.cacheHit !== true).length,
    cacheHits: records.filter((record) => record.cacheHit === true).length,
  };
}

export function buildVoiceoverPreflightReport({
  project,
  briefPath,
  voiceConfig,
  voiceGenerationMode,
  rendition,
  scenes,
  batches = [],
  batchFallbacks = [],
  attempts = [],
  generatedAt = new Date().toISOString(),
}) {
  const narrationTail = inspectNarrationTailGaps(scenes);
  const checksByScene = new Map(narrationTail.checks.map((check) => [check.sceneId, check]));
  const issues = narrationTail.excessive.map((gap) => (
    `Scene ${gap.sceneId || 'unknown'} leaves ${gap.tailSeconds.toFixed(2)}s after narration; `
    + `the maximum allowed tail is ${gap.maximumTailSeconds.toFixed(2)}s.`
  ));
  const fingerprint = voiceoverPreflightFingerprint({
    project,
    voiceConfig,
    voiceGenerationMode,
    rendition,
  });
  return {
    schemaVersion: 1,
    status: issues.length === 0 ? 'passed' : 'failed',
    generatedAt,
    projectId: project.id,
    briefPath,
    productionContentFingerprint: productionContentFingerprint(project),
    fingerprint,
    rendition: {
      id: rendition?.id ?? 'primary',
      width: rendition?.width,
      height: rendition?.height,
      fps: Number(project?.render?.fps ?? 30),
    },
    voiceover: {
      engine: voiceConfig.engine,
      model: voiceConfig.model,
      voice: voiceConfig.voice,
      rate: voiceConfig.rate,
      profile: voiceConfig.profile,
      style: voiceConfig.style,
      pronunciations: voiceConfig.pronunciations,
      generationModeRequested: voiceGenerationMode,
      batches,
      batchFallbacks,
      requestSummary: requestSummary(batches, scenes),
    },
    duration: scenes.at(-1)?.end ?? 0,
    narrationTail,
    scenes: scenes.map((scene) => ({
      id: scene.id,
      sourceId: scene.sourceId,
      sourceStart: scene.sourceStart,
      sourceEnd: scene.sourceEnd,
      renderSourceEnd: scene.renderSourceEnd,
      mediaPlaybackRate: scene.mediaPlaybackRate,
      frameCount: scene.frameCount,
      speechDuration: scene.speechDuration,
      duration: scene.duration,
      tailSeconds: checksByScene.get(scene.id)?.tailSeconds ?? null,
      rawPath: scene.rawPath,
      paddedPath: scene.paddedPath,
      voiceArtifact: scene.voiceArtifact,
    })),
    attempts,
    issues,
  };
}

export function buildFailedVoiceoverPreflightReport({
  project,
  briefPath,
  voiceConfig,
  voiceGenerationMode,
  rendition,
  attempts,
  error,
  generatedAt = new Date().toISOString(),
}) {
  return {
    schemaVersion: 1,
    status: 'failed',
    generatedAt,
    projectId: project.id,
    briefPath,
    productionContentFingerprint: productionContentFingerprint(project),
    fingerprint: voiceoverPreflightFingerprint({
      project,
      voiceConfig,
      voiceGenerationMode,
      rendition,
    }),
    rendition: {
      id: rendition?.id ?? 'primary',
      width: rendition?.width,
      height: rendition?.height,
      fps: Number(project?.render?.fps ?? 30),
    },
    voiceover: {
      engine: voiceConfig.engine,
      model: voiceConfig.model,
      voice: voiceConfig.voice,
      rate: voiceConfig.rate,
      profile: voiceConfig.profile,
      style: voiceConfig.style,
      pronunciations: voiceConfig.pronunciations,
      generationModeRequested: voiceGenerationMode,
      batches: [],
      batchFallbacks: [],
      requestSummary: { recorded: 0, external: 0, cacheHits: 0 },
    },
    duration: null,
    narrationTail: null,
    scenes: [],
    attempts,
    issues: [String(error)],
  };
}

export function voiceoverPreflightReadiness({
  project,
  report,
  voiceConfig,
  voiceGenerationMode,
  rendition,
}) {
  const issues = [];
  if (!report) {
    issues.push('缺少当前版本的旁白时长预检。');
    return { ready: false, issues, sceneCount: 0 };
  }
  if (report.schemaVersion !== 1) issues.push('旁白时长预检版本不受支持。');
  if (report.projectId !== project.id) issues.push('旁白时长预检不属于当前项目。');
  const expectedFingerprint = voiceoverPreflightFingerprint({
    project,
    voiceConfig,
    voiceGenerationMode,
    rendition,
  });
  if (report.fingerprint !== expectedFingerprint) {
    issues.push('旁白、场景窗口、配音设置或输出规格已变化，必须重新执行旁白预检。');
  }
  if (report.status !== 'passed') {
    issues.push(...(Array.isArray(report.issues) && report.issues.length
      ? report.issues.map((issue) => String(issue))
      : ['旁白时长预检未通过。']));
  }
  const expectedSceneIds = enabledSceneIds(project);
  const actualSceneIds = Array.isArray(report.scenes)
    ? report.scenes.map((scene) => String(scene.id))
    : [];
  if (
    expectedSceneIds.length !== actualSceneIds.length
    || expectedSceneIds.some((sceneId, index) => sceneId !== actualSceneIds[index])
  ) {
    issues.push('旁白时长预检没有覆盖全部当前启用场景。');
  }
  const projectScenes = new Map((project?.scenes ?? []).map((scene) => [String(scene.id), scene]));
  for (const reportScene of Array.isArray(report.scenes) ? report.scenes : []) {
    const scene = projectScenes.get(String(reportScene.id));
    if (!scene) continue;
    if (
      reportScene.sourceId !== scene.sourceId
      || Number(reportScene.sourceStart) !== Number(scene.sourceStart)
      || Number(reportScene.sourceEnd) !== Number(scene.sourceEnd)
    ) {
      issues.push(`场景 ${reportScene.id} 的旁白预检没有绑定当前 sourceId/sourceStart/sourceEnd。`);
    }
  }
  const narrationTail = inspectNarrationTailGaps(report.scenes);
  if (narrationTail.checks.length !== expectedSceneIds.length) {
    issues.push('旁白时长预检缺少可核验的逐幕语音时长。');
  }
  for (const gap of narrationTail.excessive) {
    issues.push(`场景 ${gap.sceneId || 'unknown'} 的旁白尾留为 ${gap.tailSeconds.toFixed(2)}s，超过 ${gap.maximumTailSeconds.toFixed(2)}s。`);
  }
  return {
    ready: issues.length === 0,
    issues,
    sceneCount: actualSceneIds.length,
    fingerprint: expectedFingerprint,
  };
}

export function assertCurrentVoiceoverPreflight(input) {
  const readiness = voiceoverPreflightReadiness(input);
  if (!readiness.ready) {
    throw new Error(`旁白时长预检未通过：${readiness.issues.join('；')}`);
  }
  return readiness;
}
