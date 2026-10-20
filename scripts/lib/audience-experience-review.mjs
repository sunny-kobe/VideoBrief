import { createHash } from 'node:crypto';
import { buildProjectStageContext } from './project-stage-context.mjs';
import { productionContentFingerprint } from './production-content-fingerprint.mjs';

function numberOrNull(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
    ? Number(value) : null;
}

function sameNumber(left, right) {
  const a = numberOrNull(left), b = numberOrNull(right);
  return a !== null && b !== null && Math.abs(a - b) <= 0.001;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasSceneList(artifact) {
  return Array.isArray(artifact?.scenes) && artifact.scenes.every(isRecord);
}

function evidenceState({ project, projectText, manifest, timeline, artifactIssues = [] }) {
  const issues = [...artifactIssues];
  let stale = false;
  let unavailable = !manifest || !timeline;
  if (!manifest) issues.push('缺少可读取的 render-manifest.json。');
  if (!timeline) issues.push('缺少可读取的 timeline.json。');
  if (manifest) {
    if (manifest.projectId !== project.id) {
      stale = true;
      issues.push('Manifest 的 projectId 与 canonical 不一致。');
    }
    const fingerprint = manifest.productionContentFingerprint;
    const legacyMatches = typeof projectText === 'string' && manifest.projectFingerprint
      && createHash('sha256').update(projectText).digest('hex') === manifest.projectFingerprint;
    if (fingerprint ? fingerprint !== productionContentFingerprint(project) : !legacyMatches) {
      if (fingerprint || manifest.projectFingerprint) stale = true;
      else unavailable = true;
      issues.push('Manifest 缺少可验证指纹，或其生产内容与当前 canonical 不一致。');
    }
  }
  const canonicalScenes = (project.scenes ?? []).filter((scene) => scene.enabled !== false);
  for (const [label, artifact] of [['timeline', timeline], ['manifest', manifest]]) {
    if (!artifact) continue;
    const scenes = artifact.scenes;
    if (!hasSceneList(artifact)) {
      unavailable = true;
      issues.push(`${label} 缺少有效场景列表。`);
      continue;
    }
    if (label === 'timeline' && scenes.some((scene) => scene.subtitleCues !== undefined
      && (!Array.isArray(scene.subtitleCues) || !scene.subtitleCues.every(isRecord)))) {
      unavailable = true;
      issues.push('Timeline 字幕列表格式无效。');
    }
    if (scenes.length !== canonicalScenes.length || scenes.some((scene, index) => {
      const canonical = canonicalScenes[index];
      return !canonical || canonical.id !== scene.id || canonical.sourceId !== scene.sourceId
        || !sameNumber(canonical.sourceStart, scene.sourceStart)
        || !sameNumber(canonical.sourceEnd, scene.sourceEnd)
        || (label === 'timeline' && canonical.narration !== scene.narration);
    })) {
      stale = true;
      issues.push(`${label} 的场景顺序、旁白或来源窗口与 canonical 不一致。`);
    }
  }
  if (manifest && timeline) {
    const a = numberOrNull(manifest.render?.duration), b = numberOrNull(timeline.duration);
    if (a !== null && b !== null && Math.abs(a - b) > 0.05) {
      stale = true;
      issues.push('Timeline 与 manifest 的总时长不一致。');
    }
    const timelineScenes = hasSceneList(timeline) ? timeline.scenes : [];
    const manifestScenes = hasSceneList(manifest) ? manifest.scenes : [];
    for (const scene of timelineScenes) {
      const rendered = manifestScenes.find((item) => item.id === scene.id);
      for (const field of ['start', 'end']) {
        if (numberOrNull(scene[field]) !== null && numberOrNull(rendered?.[field]) !== null
          && !sameNumber(scene[field], rendered[field])) {
          stale = true;
          issues.push(`${scene.id} 的 ${field} 在 timeline 与 manifest 中不一致。`);
        }
      }
    }
  }
  return { status: stale ? 'stale' : unavailable ? 'unavailable' : 'current', issues };
}

function audioSummary(manifest, evidence) {
  const available = evidence.status === 'current';
  const render = available ? manifest?.render : null;
  const voiceover = available ? manifest?.voiceover : null;
  const engine = voiceover?.engine ?? render?.voiceEngine ?? null;
  const style = voiceover?.style ?? render?.voiceStyle ?? null;
  const edge = engine === 'edge-tts';
  return {
    status: !available ? evidence.status : engine ? 'recorded' : 'unavailable',
    engine,
    model: voiceover?.model ?? render?.voiceModel ?? null,
    voice: voiceover?.voice ?? render?.voice ?? null,
    rate: numberOrNull(render?.rate),
    profile: voiceover?.profile ?? render?.voiceProfile ?? null,
    style,
    generationMode: voiceover?.generationModeRequested ?? render?.voiceGenerationMode ?? null,
    styleControl: edge ? 'unsupported-by-engine' : engine ? 'requires-listening' : 'unavailable',
    note: edge
      ? 'Edge TTS 不使用自然语言 voiceStyle 控制表演；profile 标签不能证明自然听感。逐幕生成需试听跨镜头语调与停顿。'
      : '这里只报告已记录的声音配置，未试听，不能判断自然度或声音表现。',
  };
}

function tailDistribution(scenes, available) {
  const values = scenes.map((scene) => scene.tailSeconds).filter((value) => value !== null);
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    status: available ? values.length ? 'recorded' : 'unavailable' : 'unavailable',
    knownSceneCount: values.length,
    unknownSceneCount: scenes.length - values.length,
    minimumSeconds: values.length ? Math.min(...values) : null,
    maximumSeconds: values.length ? Math.max(...values) : null,
    meanSeconds: mean,
    standardDeviationSeconds: mean === null ? null
      : Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length),
    note: '尾留是场景时长减去已记录语音时长；均匀或不均匀都需结合意思试听，不能据此判定节奏好坏。',
  };
}

function reviewProject(input) {
  const { project, manifest, timeline } = input;
  const context = buildProjectStageContext(project, 'material');
  const evidence = evidenceState(input);
  const current = evidence.status === 'current';
  const sources = new Map(context.sources.map((source) => [source.id, source]));
  const cues = [];
  const scenes = context.scenes.map((scene) => {
    const rendered = current && hasSceneList(timeline)
      ? timeline.scenes.find((item) => item.id === scene.id) : null;
    const start = numberOrNull(rendered?.start);
    const duration = numberOrNull(rendered?.duration);
    const speechDuration = numberOrNull(rendered?.speechDuration);
    const subtitleCues = Array.isArray(rendered?.subtitleCues) ? rendered.subtitleCues : [];
    for (const cue of subtitleCues) {
      if (!isRecord(cue)) continue;
      const text = String(cue.text ?? '');
      const plain = text.replace(/[\s\p{P}\p{S}]/gu, '');
      const cueStart = numberOrNull(cue.start), cueEnd = numberOrNull(cue.end);
      const cueDuration = cueStart !== null && cueEnd !== null ? cueEnd - cueStart : null;
      if (/^(这时|关键是|所以|然后|于是|但是|不过|同时|其实|而且|那么|可是|因此|接着|最后)$/.test(plain)
        && cueDuration !== null && cueDuration >= 1) {
        cues.push({ sceneId: scene.id, text, outputStartSeconds: start === null ? null : start + cueStart,
          durationSeconds: cueDuration, status: 'needs-listening' });
      }
    }
    const source = sources.get(scene.sourceId);
    return {
      sceneId: scene.id, title: scene.title, narration: scene.narration,
      visualRequirement: scene.visualRequirement,
      outputStartSeconds: start, outputEndSeconds: numberOrNull(rendered?.end),
      durationSeconds: duration, speechDurationSeconds: speechDuration,
      tailSeconds: duration !== null && speechDuration !== null ? duration - speechDuration : null,
      sourceWindow: { sourceId: scene.sourceId, startSeconds: numberOrNull(scene.sourceStart), endSeconds: numberOrNull(scene.sourceEnd) },
      material: {
        mediaType: scene.selectedCandidate?.mediaType ?? null,
        sourceLabel: source?.label ?? null, originUrl: source?.originUrl ?? null,
        matchReason: scene.selectedCandidate?.matchReason ?? null,
        realFootageStatus: 'not-assessed',
        note: 'mediaType=video 或 MP4 不能证明真实拍摄；动画、合成、来源及画面职责须逐幕人工复核。',
      },
    };
  });
  const editorialChecks = current ? manifest.acceptance?.semantic?.editorialQuality?.checks ?? null : null;
  return {
    projectId: context.project.id, title: context.project.title, briefPath: input.briefPath ?? null,
    status: 'needs-viewing', evidence,
    durationSeconds: current ? numberOrNull(timeline.duration) ?? numberOrNull(manifest.render?.duration) : null,
    configuredAudio: project.render ? { engine: project.render.voiceEngine ?? null, voice: project.render.voice ?? null,
      rate: numberOrNull(project.render.rate), style: project.render.voiceStyle ?? null,
      generationMode: project.render.voiceGenerationMode ?? null } : null,
    actualAudio: audioSummary(manifest, evidence), scenes,
    tailDistribution: tailDistribution(scenes, current),
    subtitleReview: { status: current ? 'needs-viewing' : evidence.status, cues: current ? cues : null,
      criteria: { connectorOnly: true, minimumDisplaySeconds: 1 },
      note: '这些短连接词字幕仅供复核。字幕停留时长不代表语音停顿，也不能自动判定为坏字幕。' },
    editorialChecks,
  };
}

export function buildAudienceExperienceReview(inputs) {
  const projects = inputs.map(reviewProject);
  const groups = new Map();
  for (const project of projects) {
    for (const [checkId, check] of Object.entries(project.editorialChecks ?? {})) {
      const note = typeof check?.note === 'string' ? check.note : '';
      if (!note.trim()) continue;
      const key = JSON.stringify([checkId, note]);
      if (!groups.has(key)) groups.set(key, { checkId, note, projectIds: [], status: 'needs-review' });
      const group = groups.get(key);
      if (!group.projectIds.includes(project.projectId)) group.projectIds.push(project.projectId);
    }
  }
  return {
    schemaVersion: 1, status: 'needs-viewing', mode: 'diagnostic-only',
    note: '只读观众体验诊断；未试听或连续审片，不生成自然度分数，不批准或修改任何验收 Gate。',
    projects,
    repeatedEditorialNotes: [...groups.values()].filter((group) => group.projectIds.length > 1),
    repeatedNotesCaveat: '同一检查的备注完全相同可能合理，也可能是复制疏漏；这里只提供人工复核线索，绝不自动判失败。',
  };
}
