import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { validateRenderPlan } from '../scripts/lib/render-plan-validation.mjs';

function fixture() {
  const filterComplex = '[0:v]trim=start=2:duration=3,setpts=PTS-STARTPTS[vout]';
  const sourceInput = {
    inputIndex: 0,
    sourceId: 'source-01',
    sourceType: 'video',
    assetPath: 'public/source.mp4',
    resolvedPath: '/tmp/source.mp4',
    contentSha256: 'a'.repeat(64),
  };
  const commandArgs = [
    '-y',
    '-i', sourceInput.resolvedPath,
    '-i', '/tmp/voiceover.aiff',
    '-filter_complex', filterComplex,
    '-t', '3.000',
    '/tmp/output.mp4',
  ];
  const commandSha256 = createHash('sha256').update(JSON.stringify(commandArgs)).digest('hex');
  const manifest = {
    projectId: 'project-a',
    projectFingerprint: 'fingerprint-after-proof',
    renderProjectFingerprint: 'fingerprint-a',
    render: { width: 1920, height: 1080, fps: 30, duration: 3 },
    renderInputs: [sourceInput],
    renderCommandSha256: commandSha256,
    artifacts: { outputVideo: '/tmp/output.mp4' },
    scenes: [{
      id: 'scene-01', sourceId: 'source-01', sourceStart: 2, sourceEnd: 5,
      renderSourceEnd: 5, frameCount: 90, start: 0, end: 3,
    }],
  };
  const plan = {
    schemaVersion: 2,
    projectId: manifest.projectId,
    projectFingerprint: manifest.renderProjectFingerprint,
    expectedDuration: 3,
    render: { width: 1920, height: 1080, fps: 30 },
    inputs: [sourceInput],
    graph: {
      filterComplex,
      filterComplexSha256: createHash('sha256').update(filterComplex).digest('hex'),
    },
    command: {
      args: commandArgs,
      argsSha256: commandSha256,
      audioInputPath: '/tmp/voiceover.aiff',
      outputPath: '/tmp/output.mp4',
    },
    scenes: [{
      id: 'scene-01',
      sourceId: 'source-01',
      sourceStart: 2,
      sourceEnd: 5,
      renderSourceEnd: 5,
      frameCount: 90,
      outputStart: 0,
      outputEnd: 3,
    }],
  };
  return { manifest, plan };
}

function segmentedFixture() {
  const { manifest, plan } = fixture() as { manifest: any; plan: any };
  const cacheKey = 'b'.repeat(64);
  const segmentSha256 = 'c'.repeat(64);
  const segmentFilter = '[0:v]trim=start=2:end=5[vout]';
  const segmentArgs = ['-y', '-i', '/tmp/source.mp4', '/tmp/segment.tmp.mp4'];
  const concatArgs = [
    '-y', '-f', 'concat', '-safe', '0', '-i', '/tmp/video-segments.txt',
    '-c', 'copy', '/tmp/output.tmp.mp4',
  ];
  const concatSha256 = createHash('sha256').update(JSON.stringify(concatArgs)).digest('hex');
  plan.schemaVersion = 3;
  plan.strategy = 'segmented-concat';
  plan.command = {
    executable: '/tmp/ffmpeg',
    args: concatArgs,
    argsSha256: concatSha256,
    outputPath: '/tmp/output.mp4',
  };
  plan.concat = {
    listPath: '/tmp/video-segments.txt',
    listSha256: 'd'.repeat(64),
    command: {
      executable: '/tmp/ffmpeg',
      args: concatArgs,
      argsSha256: concatSha256,
      temporaryOutputPath: '/tmp/output.tmp.mp4',
      outputPath: '/tmp/output.mp4',
    },
  };
  Object.assign(plan.scenes[0], {
    cacheKey,
    segmentPath: '/tmp/segment.mp4',
    segmentSha256,
    createdFrom: {
      filterComplex: segmentFilter,
      filterComplexSha256: createHash('sha256').update(segmentFilter).digest('hex'),
      command: {
        args: segmentArgs,
        argsSha256: createHash('sha256').update(JSON.stringify(segmentArgs)).digest('hex'),
      },
    },
  });
  Object.assign(manifest.scenes[0], {
    segmentCacheKey: cacheKey,
    segmentPath: '/tmp/segment.mp4',
    segmentSha256,
  });
  manifest.renderCommandSha256 = concatSha256;
  return { manifest, plan };
}

test('accepts a render plan bound to the manifest timeline', () => {
  const { manifest, plan } = fixture();
  assert.deepEqual(validateRenderPlan(plan, manifest), []);
});

test('rejects graph or scene drift after compilation', () => {
  const { manifest, plan } = fixture();
  plan.graph.filterComplex += ',fps=60';
  plan.scenes[0].sourceStart = 1;
  assert.deepEqual(validateRenderPlan(plan, manifest), [
    'Render plan filter_complex hash is invalid.',
    'Render plan FFmpeg command does not use the recorded filter_complex graph.',
    'Render plan scene scene-01 does not match the manifest timeline.',
  ]);
});

test('rejects source hashes that cannot prove exact input bytes', () => {
  const { manifest, plan } = fixture();
  plan.inputs[0].contentSha256 = 'not-a-sha256';
  manifest.renderInputs[0].contentSha256 = 'not-a-sha256';
  assert.deepEqual(validateRenderPlan(plan, manifest), [
    'Render plan source source-01 has no valid content SHA-256.',
  ]);
});

test('rejects FFmpeg argument drift even when the graph is unchanged', () => {
  const { manifest, plan } = fixture();
  plan.command.args[plan.command.args.length - 1] = '/tmp/other.mp4';
  assert.deepEqual(validateRenderPlan(plan, manifest), [
    'Render plan FFmpeg command hash is invalid.',
    'Render plan FFmpeg command does not match the manifest.',
    'Render plan FFmpeg output does not match the manifest.',
  ]);
});

test('rejects a scene without an auditable frame count', () => {
  const { manifest, plan } = fixture();
  delete (plan.scenes[0] as Partial<typeof plan.scenes[0]>).frameCount;
  delete (manifest.scenes[0] as Partial<typeof manifest.scenes[0]>).frameCount;
  assert.deepEqual(validateRenderPlan(plan, manifest), [
    'Render plan scene scene-01 has no positive integer frameCount.',
  ]);
});

test('rejects a frame-aligned video segment that exceeds the selected source window', () => {
  const { manifest, plan } = fixture();
  plan.scenes[0].renderSourceEnd = 5.1;
  manifest.scenes[0].renderSourceEnd = 5.1;
  assert.deepEqual(validateRenderPlan(plan, manifest), [
    'Render plan scene scene-01 renders outside its selected source window.',
  ]);
});

test('accepts a segmented render plan bound to cached scene bytes', () => {
  const { manifest, plan } = segmentedFixture();
  assert.deepEqual(validateRenderPlan(plan, manifest), []);
});

test('rejects drift in segmented render cache evidence', () => {
  const { manifest, plan } = segmentedFixture();
  plan.scenes[0].segmentSha256 = 'e'.repeat(64);
  assert.deepEqual(validateRenderPlan(plan, manifest), [
    'Render plan scene scene-01 has invalid segment cache evidence.',
  ]);
});
