import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { buildAudienceExperienceReview } from '../scripts/lib/audience-experience-review.mjs';
import { productionContentFingerprint } from '../scripts/lib/production-content-fingerprint.mjs';

function fixture(id = 'project-a') {
  const project = {
    schemaVersion: 1, id, title: id, brief: {}, render: { voiceEngine: 'edge-tts', voiceStyle: '自然讲述' },
    sources: [{ id: 'source-1', sourceType: 'video', originUrl: 'local://videobrief-original/animation' }],
    scenes: [{ id: 'scene-1', enabled: true, sourceId: 'source-1', sourceStart: 0, sourceEnd: 6,
      narration: '关键是，热量还在。', selectedCandidateId: 'candidate-1',
      candidates: [{ id: 'candidate-1', sourceId: 'source-1', mediaType: 'video', sourceStart: 0, sourceEnd: 6 }],
    }],
  };
  const manifest = {
    projectId: id, productionContentFingerprint: productionContentFingerprint(project),
    render: { duration: 6, voiceEngine: 'edge-tts', voiceStyle: '自然讲述', voice: 'Yunxi', voiceGenerationMode: 'per-scene' },
    scenes: [{ id: 'scene-1', sourceId: 'source-1', sourceStart: 0, sourceEnd: 6, start: 0, end: 6 }],
    acceptance: { semantic: { editorialQuality: { checks: { pacing: { status: 'passed', note: '尾留相同不等于节奏自然，需要实际观看。' } } } } },
  };
  const timeline = { duration: 6, scenes: [{ ...project.scenes[0], start: 0, end: 6, duration: 6,
    speechDuration: 5.5, subtitleCues: [{ start: 0, end: 1.2, text: '关键是，' }],
  }] };
  return { project, manifest, timeline };
}

test('repeated editorial notes are review leads, never a failed or passed audience gate', () => {
  const report = buildAudienceExperienceReview([fixture(), fixture('project-b')]);
  assert.equal(report.status, 'needs-viewing');
  assert.equal(report.mode, 'diagnostic-only');
  assert.equal(report.repeatedEditorialNotes.length, 1);
  assert.equal(report.repeatedEditorialNotes[0].checkId, 'pacing');
  assert.deepEqual(report.repeatedEditorialNotes[0].projectIds, ['project-a', 'project-b']);
  assert.equal(report.projects[0].subtitleReview.cues?.[0].durationSeconds, 1.2);
  assert.match(report.projects[0].subtitleReview.note, /不代表语音停顿/);
  assert.equal(report.projects[0].actualAudio.styleControl, 'unsupported-by-engine');
});

test('canonical drift prevents historical audio, timing and notes from appearing current', () => {
  const input = fixture();
  input.project.scenes[0].narration = '已经改稿。';
  const project = buildAudienceExperienceReview([input]).projects[0];
  assert.equal(project.evidence.status, 'stale');
  assert.equal(project.actualAudio.status, 'stale');
  assert.equal(project.actualAudio.voice, null);
  assert.equal(project.durationSeconds, null);
  assert.equal(project.scenes[0].outputStartSeconds, null);
  assert.equal(project.tailDistribution.knownSceneCount, 0);
  assert.equal(project.editorialChecks, null);
});

test('a mismatched timeline is stale even when the manifest fingerprint matches', () => {
  const input = fixture();
  input.timeline.scenes[0].sourceEnd = 5;
  assert.equal(buildAudienceExperienceReview([input]).projects[0].evidence.status, 'stale');
});

test('unknown duration and missing audio evidence stay null, never measured zero', () => {
  const input: any = fixture();
  delete input.timeline.duration;
  delete input.timeline.scenes[0].duration;
  delete input.timeline.scenes[0].start;
  delete input.timeline.scenes[0].end;
  delete input.timeline.scenes[0].speechDuration;
  delete input.manifest.render;
  delete input.manifest.scenes[0].start;
  delete input.manifest.scenes[0].end;
  const result = buildAudienceExperienceReview([input]).projects[0];
  assert.equal(result.durationSeconds, null);
  assert.equal(result.actualAudio.status, 'unavailable');
  assert.equal(result.actualAudio.rate, null);
  assert.equal(result.tailDistribution.meanSeconds, null);
  assert.equal(result.scenes[0].tailSeconds, null);
  assert.equal(result.scenes[0].speechDurationSeconds, null);
});

test('missing artifacts are unavailable and an animation MP4 is never counted as real footage', () => {
  const input: any = fixture();
  delete input.timeline;
  const result = buildAudienceExperienceReview([input]).projects[0];
  assert.equal(result.evidence.status, 'unavailable');
  assert.equal(result.scenes[0].material.mediaType, 'video');
  assert.equal(result.scenes[0].material.realFootageStatus, 'not-assessed');
  assert.match(result.scenes[0].material.note, /不能证明真实拍摄/);
  assert.equal(result.subtitleReview.cues, null);
  assert.equal(result.tailDistribution.meanSeconds, null);
});

test('a missing manifest never promotes canonical voice settings to recorded audio', () => {
  const { manifest: _manifest, ...input } = fixture();
  const result = buildAudienceExperienceReview([input]).projects[0];
  assert.equal(result.evidence.status, 'unavailable');
  assert.equal(result.configuredAudio?.engine, 'edge-tts');
  assert.equal(result.actualAudio.engine, null);
  assert.equal(result.actualAudio.status, 'unavailable');
});

test('a timeline with a non-array scene list is unavailable instead of crashing', () => {
  const input: any = fixture();
  input.timeline.scenes = {};
  const result = buildAudienceExperienceReview([input]).projects[0];
  assert.equal(result.evidence.status, 'unavailable');
  assert.equal(result.actualAudio.voice, null);
  assert.equal(result.scenes[0].outputStartSeconds, null);
  assert.equal(result.subtitleReview.cues, null);
});

test('a manifest with a non-array scene list is unavailable instead of crashing', () => {
  const input: any = fixture();
  input.manifest.scenes = {};
  const result = buildAudienceExperienceReview([input]).projects[0];
  assert.equal(result.evidence.status, 'unavailable');
  assert.equal(result.actualAudio.voice, null);
  assert.equal(result.scenes[0].outputStartSeconds, null);
  assert.equal(result.subtitleReview.cues, null);
});

test('CLI defaults to read-only stdout and rejects report destinations outside its output folder', () => {
  const root = mkdtempSync(join(tmpdir(), 'audience-review-'));
  try {
    const input: any = fixture();
    input.project.outputs = { workDir: root };
    input.manifest.productionContentFingerprint = productionContentFingerprint(input.project);
    const files = [join(root, 'project.json'), join(root, 'render-manifest.json'), join(root, 'timeline.json')];
    [input.project, input.manifest, input.timeline].forEach((value, index) => writeFileSync(files[index], JSON.stringify(value)));
    const before = files.map((path) => readFileSync(path, 'utf8'));
    const script = resolve('scripts/review-audience-experience.mjs');
    const result = spawnSync(process.execPath, [script, `--brief=${files[0]}`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).projects[0].evidence.status, 'current');
    assert.deepEqual(files.map((path) => readFileSync(path, 'utf8')), before);
    const refused = spawnSync(process.execPath, [script, `--brief=${files[0]}`, `--output=${join(root, 'report.json')}`], { encoding: 'utf8' });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /output\/audience-reviews/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
