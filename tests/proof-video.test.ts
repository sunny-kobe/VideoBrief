import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import ffmpegPath from 'ffmpeg-static';

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function segmentedProofFixture() {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-proof-segmented-'));
  const projectPath = join(root, 'project.json');
  const sourcePath = join(root, 'source.mp4');
  const outputPath = join(root, 'output.mp4');
  const segmentPath = join(root, 'segment.mp4');
  const segmentListPath = join(root, 'video-segments.txt');
  const renderPlanPath = join(root, 'render-plan.json');
  const manifestPath = join(root, 'manifest.json');
  const temporaryOutputPath = join(root, 'output.tmp.mp4');
  const project = {
    id: 'segmented-proof-tamper',
    technical_status: 'not_rendered',
    rights_status: 'cleared',
    publication_status: 'draft-unpublished',
    market_status: 'none',
    production: {},
  };
  const projectText = `${JSON.stringify(project, null, 2)}\n`;
  const sourceBytes = Buffer.from('source-bytes');
  const outputBytes = Buffer.from('output-bytes');
  const segmentBytes = Buffer.from('segment-bytes');
  const segmentListText = `file '${segmentPath}'\n`;
  writeFileSync(projectPath, projectText);
  writeFileSync(sourcePath, sourceBytes);
  writeFileSync(outputPath, outputBytes);
  writeFileSync(segmentPath, segmentBytes);
  writeFileSync(segmentListPath, segmentListText);

  const projectFingerprint = sha256(projectText);
  const sourceInput = {
    inputIndex: 0,
    sourceId: 'source-01',
    sourceType: 'video',
    assetPath: sourcePath,
    resolvedPath: sourcePath,
    contentSha256: sha256(sourceBytes),
  };
  const segmentFilter = '[0:v]trim=start=0:end=1[vout]';
  const segmentArgs = ['-y', '-i', sourcePath, segmentPath];
  const concatArgs = [
    '-y', '-f', 'concat', '-safe', '0', '-i', segmentListPath,
    '-c', 'copy', temporaryOutputPath,
  ];
  const concatCommandSha256 = sha256(JSON.stringify(concatArgs));
  const segmentSha256 = sha256(segmentBytes);
  const segmentCacheKey = 'a'.repeat(64);
  const renderPlan = {
    schemaVersion: 3,
    strategy: 'segmented-concat',
    projectId: project.id,
    projectFingerprint,
    expectedDuration: 1,
    render: { width: 320, height: 180, fps: 30 },
    inputs: [sourceInput],
    command: {
      executable: '/tmp/ffmpeg',
      args: concatArgs,
      argsSha256: concatCommandSha256,
      outputPath,
    },
    concat: {
      listPath: segmentListPath,
      listSha256: sha256(segmentListText),
      command: {
        executable: '/tmp/ffmpeg',
        args: concatArgs,
        argsSha256: concatCommandSha256,
        temporaryOutputPath,
        outputPath,
      },
    },
    scenes: [{
      id: 'scene-01',
      sourceId: sourceInput.sourceId,
      sourceStart: 0,
      sourceEnd: 1,
      renderSourceEnd: 1,
      frameCount: 30,
      outputStart: 0,
      outputEnd: 1,
      cacheKey: segmentCacheKey,
      segmentPath,
      segmentSha256,
      createdFrom: {
        filterComplex: segmentFilter,
        filterComplexSha256: sha256(segmentFilter),
        command: {
          args: segmentArgs,
          argsSha256: sha256(JSON.stringify(segmentArgs)),
        },
      },
    }],
  };
  const renderPlanText = `${JSON.stringify(renderPlan, null, 2)}\n`;
  writeFileSync(renderPlanPath, renderPlanText);
  writeFileSync(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    renderContractVersion: 3,
    projectId: project.id,
    projectFingerprint,
    renderProjectFingerprint: projectFingerprint,
    renderedAt: new Date().toISOString(),
    briefPath: projectPath,
    render: { width: 320, height: 180, fps: 30, duration: 1 },
    artifacts: { outputVideo: outputPath, publicRender: null, renderPlan: renderPlanPath },
    renderInputs: [sourceInput],
    renderCommandSha256: concatCommandSha256,
    renderPlanSha256: sha256(renderPlanText),
    scenes: [{
      id: 'scene-01',
      sourceId: sourceInput.sourceId,
      sourceStart: 0,
      sourceEnd: 1,
      renderSourceEnd: 1,
      frameCount: 30,
      start: 0,
      end: 1,
      segmentCacheKey,
      segmentPath,
      segmentSha256,
    }],
  }, null, 2)}\n`);
  return { root, manifestPath, projectPath, renderPlanPath, segmentPath, segmentListPath };
}

test('rejects a render whose video stream ends before its audio stream', () => {
  assert.ok(ffmpegPath);
  const root = mkdtempSync(join(tmpdir(), 'videobrief-proof-'));
  const videoPath = join(root, 'mismatched.mp4');
  const projectPath = join(root, 'project.json');
  const manifestPath = join(root, 'manifest.json');
  const project = {
    id: 'stream-duration-mismatch',
    technical_status: 'not_rendered',
    rights_status: 'cleared',
    publication_status: 'draft-unpublished',
    market_status: 'none',
    production: {},
  };
  const projectText = `${JSON.stringify(project, null, 2)}\n`;
  writeFileSync(projectPath, projectText);

  execFileSync(ffmpegPath, [
    '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30:d=1',
    '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=2',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    videoPath,
  ], { stdio: 'ignore' });

  writeFileSync(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    projectId: project.id,
    projectFingerprint: createHash('sha256').update(projectText).digest('hex'),
    renderedAt: new Date().toISOString(),
    briefPath: projectPath,
    render: { width: 320, height: 180, fps: 30, duration: 2 },
    artifacts: { outputVideo: videoPath, publicRender: null },
    scenes: [],
  }, null, 2)}\n`);

  const result = spawnSync(process.execPath, [
    resolve('scripts/proof-video.mjs'),
    `--manifest=${manifestPath}`,
    `--proof-dir=${join(root, 'proof')}`,
  ], { cwd: process.cwd(), encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Video stream is .* expected 2\.00s/);
  assert.match(result.stderr, /Audio\/video duration mismatch/);
  const checkedManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(checkedManifest.proof.passed, false);
});

test('render contract version 2 rejects a missing render plan', () => {
  assert.ok(ffmpegPath);
  const root = mkdtempSync(join(tmpdir(), 'videobrief-proof-plan-'));
  const videoPath = join(root, 'valid.mp4');
  const projectPath = join(root, 'project.json');
  const manifestPath = join(root, 'manifest.json');
  const project = {
    id: 'missing-render-plan',
    technical_status: 'not_rendered',
    rights_status: 'cleared',
    publication_status: 'draft-unpublished',
    market_status: 'none',
    production: {},
  };
  const projectText = `${JSON.stringify(project, null, 2)}\n`;
  writeFileSync(projectPath, projectText);
  execFileSync(ffmpegPath, [
    '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30:d=1',
    '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=1',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-shortest',
    videoPath,
  ], { stdio: 'ignore' });
  writeFileSync(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    renderContractVersion: 2,
    projectId: project.id,
    projectFingerprint: createHash('sha256').update(projectText).digest('hex'),
    renderedAt: new Date().toISOString(),
    briefPath: projectPath,
    render: { width: 320, height: 180, fps: 30, duration: 1 },
    artifacts: { outputVideo: videoPath, publicRender: null },
    scenes: [],
  }, null, 2)}\n`);

  const result = spawnSync(process.execPath, [
    resolve('scripts/proof-video.mjs'),
    `--manifest=${manifestPath}`,
    `--proof-dir=${join(root, 'proof')}`,
  ], { cwd: process.cwd(), encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Render contract version 2 requires a render plan artifact/);
  const checkedManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(checkedManifest.proof.passed, false);
});

test('render contract version 3 rejects changed scene segment bytes', () => {
  const fixture = segmentedProofFixture();
  writeFileSync(fixture.segmentPath, 'tampered-segment-bytes');

  const result = spawnSync(process.execPath, [
    resolve('scripts/proof-video.mjs'),
    `--manifest=${fixture.manifestPath}`,
    `--proof-dir=${join(fixture.root, 'proof')}`,
  ], { cwd: process.cwd(), encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /scene scene-01 segment bytes changed after render/);
  const checkedManifest = JSON.parse(readFileSync(fixture.manifestPath, 'utf8'));
  assert.equal(checkedManifest.proof.passed, false);
});

test('render contract version 3 rejects changed concat list bytes', () => {
  const fixture = segmentedProofFixture();
  writeFileSync(fixture.segmentListPath, "file '/tmp/different-segment.mp4'\n");

  const result = spawnSync(process.execPath, [
    resolve('scripts/proof-video.mjs'),
    `--manifest=${fixture.manifestPath}`,
    `--proof-dir=${join(fixture.root, 'proof')}`,
  ], { cwd: process.cwd(), encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /segment list bytes changed after render/);
  const checkedManifest = JSON.parse(readFileSync(fixture.manifestPath, 'utf8'));
  assert.equal(checkedManifest.proof.passed, false);
});

test('long-form proof rejects a manifest without chapter fingerprints', () => {
  const fixture = segmentedProofFixture();
  const project = JSON.parse(readFileSync(fixture.projectPath, 'utf8'));
  project.brief = { targetDurationSeconds: 180 };
  project.chapters = [{
    id: 'chapter-01', order: 0, title: '章节一', summary: '摘要', sceneIds: ['scene-01'], sourceReferences: [],
  }];
  project.scenes = [{
    id: 'scene-01', chapterId: 'chapter-01', enabled: true, narration: '章节旁白', eyebrow: '', title: '章节一',
    subtitle: '章节一', visualRequirement: '来源画面', sourceReferences: [], sourceId: 'source-01',
    sourceStart: 0, sourceEnd: 1, selectedCandidateId: 'candidate-01',
  }];
  const projectText = `${JSON.stringify(project, null, 2)}\n`;
  const projectFingerprint = sha256(projectText);
  writeFileSync(fixture.projectPath, projectText);
  const renderPlan = JSON.parse(readFileSync(fixture.renderPlanPath, 'utf8'));
  renderPlan.projectFingerprint = projectFingerprint;
  const renderPlanText = `${JSON.stringify(renderPlan, null, 2)}\n`;
  writeFileSync(fixture.renderPlanPath, renderPlanText);
  const manifest = JSON.parse(readFileSync(fixture.manifestPath, 'utf8'));
  manifest.projectFingerprint = projectFingerprint;
  manifest.renderProjectFingerprint = projectFingerprint;
  manifest.renderPlanSha256 = sha256(renderPlanText);
  writeFileSync(fixture.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = spawnSync(process.execPath, [
    resolve('scripts/proof-video.mjs'),
    `--manifest=${fixture.manifestPath}`,
    `--proof-dir=${join(fixture.root, 'proof')}`,
  ], { cwd: process.cwd(), encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing chapter fingerprints/);
});
