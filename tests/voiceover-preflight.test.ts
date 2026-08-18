import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendVoiceoverPreflightAttempt,
  buildVoiceoverPreflightReport,
  voiceoverPreflightReadiness,
} from '../scripts/lib/voiceover-preflight.mjs';
import type { ShortVideoProject } from '../src/shortVideoBrief';

const voiceConfig = {
  engine: 'gemini-tts',
  model: 'gemini-3.1-flash-tts-preview',
  voice: 'Charon',
  rate: 100,
  profile: 'natural-tech-zh-v1',
  style: '自然讲述。',
  pronunciations: [],
};
const rendition = { id: 'primary', width: 1920, height: 1080 };

function project() {
  return {
    schemaVersion: 3,
    id: 'voiceover-preflight-fixture',
    title: 'Voiceover preflight fixture',
    brief: { targetDurationSeconds: 20 },
    outputs: { workDir: 'output/videos/voiceover-preflight-fixture-work' },
    render: { width: 1920, height: 1080, fps: 30, voiceGenerationMode: 'auto' },
    renditions: [],
    sources: [{ id: 'source-1', sourceType: 'video', assetPath: 'source.mp4', contentHash: 'source-hash' }],
    chapters: [],
    scenes: [{
      id: 'scene-1',
      enabled: true,
      narration: '这是一段用于验证旁白时长的文本。',
      sourceId: 'source-1',
      sourceStart: 0,
      sourceEnd: 5,
      candidates: [],
    }],
  } as unknown as ShortVideoProject;
}

function timedScene(overrides = {}) {
  return {
    id: 'scene-1',
    sourceId: 'source-1',
    sourceStart: 0,
    sourceEnd: 5,
    renderSourceEnd: 5,
    mediaPlaybackRate: 1,
    frameCount: 150,
    speechDuration: 4,
    duration: 5,
    end: 5,
    rawPath: '/tmp/raw.wav',
    paddedPath: '/tmp/padded.aiff',
    voiceArtifact: { generationMode: 'batch-silence-split', cacheHit: true },
    ...overrides,
  };
}

test('a current passed preflight binds narration, selected window, voice and rendition', () => {
  const value = project();
  const report = buildVoiceoverPreflightReport({
    project: value,
    briefPath: '/tmp/project.json',
    voiceConfig,
    voiceGenerationMode: 'auto',
    rendition,
    scenes: [timedScene()],
  });

  assert.equal(report.status, 'passed');
  assert.deepEqual(voiceoverPreflightReadiness({
    project: value,
    report,
    voiceConfig,
    voiceGenerationMode: 'auto',
    rendition,
  }).issues, []);
});

test('preflight fails before material review when a selected window leaves a long narration tail', () => {
  const value = project();
  const report = buildVoiceoverPreflightReport({
    project: value,
    briefPath: '/tmp/project.json',
    voiceConfig,
    voiceGenerationMode: 'auto',
    rendition,
    scenes: [timedScene({ speechDuration: 2, duration: 5, end: 5 })],
  });

  assert.equal(report.status, 'failed');
  assert.match(report.issues.join(' '), /leaves 3\.00s after narration/);
});

test('changing narration invalidates an otherwise passed preflight', () => {
  const value = project();
  const report = buildVoiceoverPreflightReport({
    project: value,
    briefPath: '/tmp/project.json',
    voiceConfig,
    voiceGenerationMode: 'auto',
    rendition,
    scenes: [timedScene()],
  });
  value.scenes[0].narration = '旁白已经发生变化。';

  const readiness = voiceoverPreflightReadiness({
    project: value,
    report,
    voiceConfig,
    voiceGenerationMode: 'auto',
    rendition,
  });
  assert.equal(readiness.ready, false);
  assert.match(readiness.issues.join('；'), /必须重新执行旁白预检/);
});

test('a forged passed status cannot hide a long narration tail', () => {
  const value = project();
  const report = buildVoiceoverPreflightReport({
    project: value,
    briefPath: '/tmp/project.json',
    voiceConfig,
    voiceGenerationMode: 'auto',
    rendition,
    scenes: [timedScene()],
  });
  report.status = 'passed';
  report.issues = [];
  report.scenes[0].speechDuration = 1;

  const readiness = voiceoverPreflightReadiness({
    project: value,
    report,
    voiceConfig,
    voiceGenerationMode: 'auto',
    rendition,
  });
  assert.equal(readiness.ready, false);
  assert.match(readiness.issues.join('；'), /旁白尾留为 4\.00s/);
});

test('preflight attempt history survives input changes and tags every attempt fingerprint', () => {
  const first = appendVoiceoverPreflightAttempt(null, 'fingerprint-a', { status: 'failed' });
  const previous = { fingerprint: 'fingerprint-a', attempts: first };
  const attempts = appendVoiceoverPreflightAttempt(previous, 'fingerprint-b', { status: 'passed' });
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts.map((attempt) => attempt.fingerprint), ['fingerprint-a', 'fingerprint-b']);
});
