import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import ffmpegPath from 'ffmpeg-static';
import type { ShortVideoProject } from '../src/shortVideoBrief';
import {
  researchApprovalFingerprint,
  topicApprovalFingerprint,
} from '../scripts/lib/production-workflow-contract.mjs';

function fixture(options: { acceptance?: boolean; stale?: boolean; deliveryApproved?: boolean } = {}) {
  assert.ok(ffmpegPath);
  const root = mkdtempSync(join(tmpdir(), 'videobrief-package-script-'));
  const workDir = join(root, 'work');
  const exportDir = join(root, 'export');
  const projectPath = join(root, 'project.json');
  const videoPath = join(root, 'video.mp4');
  const srtPath = join(root, 'subtitles.srt');
  const assPath = join(root, 'subtitles.ass');
  execFileSync('/bin/mkdir', ['-p', workDir]);
  execFileSync(ffmpegPath, [
    '-y',
    '-f', 'lavfi', '-i', 'color=c=0x124559:s=320x180:r=30:d=0.8',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=0.8',
    '-shortest',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    videoPath,
  ], { stdio: 'ignore' });
  writeFileSync(srtPath, '1\n00:00:00,000 --> 00:00:00,800\n测试\n');
  writeFileSync(assPath, '[Script Info]\nScriptType: v4.00+\n');
  const videoSha256 = createHash('sha256').update(readFileSync(videoPath)).digest('hex');

  const project = {
    schemaVersion: 3,
    id: 'package-script-test',
    title: 'Package script test',
    technical_status: 'passed',
    rights_status: 'cleared',
    publication_status: 'draft-unpublished',
    market_status: 'none',
    brief: { objective: 'test', coreMessage: 'test' },
    platformCopy: { coverTitle: '测试封面', title: '测试', description: '', hashtags: [] },
    render: { width: 320, height: 180 },
    outputs: { workDir, exportDir },
    scenes: [],
    sources: [{
      id: 'source-01',
      label: '测试自有画面',
      sourceType: 'image',
      materialRole: 'official_demo',
      assetPath: videoPath,
      verificationStatus: 'verified',
      rightsStatus: 'cleared',
      rightsNote: '测试夹具自有素材',
      contentHash: 'source-hash',
      processing: { status: 'completed', stage: 'completed' },
      analysis: { facts: [], uncertainties: [] },
    }],
    research: {
      transcripts: [],
      facts: [{
        id: 'fact-01',
        statement: '测试夹具只验证打包契约。',
        sourceReferences: [{ sourceId: 'source-01', locatorType: 'image', note: '测试来源' }],
        reviewStatus: 'confirmed',
        kind: 'claim',
        reviewPriority: 'required',
      }],
      uncertainties: [],
    },
    materialReview: {
      status: 'approved',
      approvedSourceIds: ['source-01'],
      reviewedAt: 'now',
    },
    production: {},
    ai: { calls: [] },
    workflow: {
      origin: {
        kind: 'manual', runId: '', candidateId: '', sourceUrl: '', score: null, summary: '',
      },
      topicApproval: {
        status: 'approved', decidedAt: 'now', decidedBy: 'test-user',
        note: '测试用户明确批准该命题。', fingerprint: '',
      },
      researchApproval: {
        status: 'approved', decidedAt: 'now', decidedBy: 'test-user',
        note: '测试用户已核对关键事实。', fingerprint: '',
      },
      deliveryApproval: {
        status: options.deliveryApproved === false ? 'pending' : 'approved',
        decidedAt: options.deliveryApproved === false ? '' : 'now',
        decidedBy: options.deliveryApproved === false ? '' : 'test-user',
        note: options.deliveryApproved === false ? '' : '测试人员已完整观看当前视频。',
        fingerprint: options.deliveryApproved === false ? '' : videoSha256,
      },
    },
  };
  const workflowProject = project as unknown as ShortVideoProject;
  project.workflow.topicApproval.fingerprint = topicApprovalFingerprint(workflowProject);
  project.workflow.researchApproval.fingerprint = researchApprovalFingerprint(workflowProject);
  const projectText = `${JSON.stringify(project, null, 2)}\n`;
  writeFileSync(projectPath, projectText);
  const projectFingerprint = createHash('sha256').update(projectText).digest('hex');
  const manifest = {
    schemaVersion: 1,
    projectId: project.id,
    projectFingerprint: options.stale ? 'stale-project' : projectFingerprint,
    renderedAt: '2026-07-21T00:00:00.000Z',
    briefPath: projectPath,
    render: { width: 320, height: 180, fps: 30, duration: 0.8 },
    artifacts: {
      outputVideo: videoPath,
      publicRender: null,
      srt: srtPath,
      subtitles: assPath,
    },
    scenes: [],
    proof: { passed: true, checkedAt: 'now', issues: [], frames: [] },
    ...(options.acceptance === false ? {} : {
      acceptance: {
        videoSha256,
        semantic: {
          status: 'passed', checkedAt: 'now', reviewer: 'test', issues: [], scenes: [],
          activeSeconds: 30, minimumActiveSeconds: 30,
          activeSecondsSource: 'review-session', reviewSessionId: 'session-01',
          editorialQuality: { status: 'passed' },
        },
        browser: {
          status: 'passed', checkedAt: 'now', url: 'http://localhost', browser: 'Chrome',
          viewport: { width: 320, height: 180 }, readyState: 4, duration: 0.8,
          playedSeconds: 0.8, ended: true, consoleErrors: [], mediaError: '', screenshot: '', issues: [],
          checks: [
            {
              name: 'desktop', viewport: { width: 1440, height: 900 }, readyState: 4,
              duration: 0.8, playedSeconds: 0.8, ended: true, fullPlayback: true, playbackRate: 1,
              muted: false, volume: 0.05, consoleErrors: [], mediaError: '', screenshot: '',
            },
            {
              name: 'mobile', viewport: { width: 390, height: 844 }, readyState: 4,
              duration: 0.8, playedSeconds: 0.8, ended: true, fullPlayback: true, playbackRate: 1,
              muted: false, volume: 0.05, consoleErrors: [], mediaError: '', screenshot: '',
            },
          ],
        },
      },
    }),
  };
  writeFileSync(join(workDir, 'render-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { projectPath, exportDir };
}

function run(projectPath: string) {
  return spawnSync(process.execPath, [
    resolve('scripts/build-export-package.mjs'),
    `--brief=${projectPath}`,
  ], { cwd: process.cwd(), encoding: 'utf8' });
}

test('build-export-package rejects a stale project fingerprint', () => {
  const value = fixture({ stale: true });
  const result = run(value.projectPath);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /stale render/);
});

test('build-export-package rejects technical proof without acceptance', () => {
  const value = fixture({ acceptance: false });
  const result = run(value.projectPath);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /acceptance is bound/);
});

test('build-export-package rejects legacy self-reported semantic review time', () => {
  const value = fixture();
  const manifestPath = join(value.exportDir.replace(/\/export$/, '/work'), 'render-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.acceptance.semantic.activeSecondsSource = 'legacy-manual';
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const result = run(value.projectPath);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /review session/);
});

test('build-export-package rejects acceptance without human delivery approval', () => {
  const value = fixture({ deliveryApproved: false });
  const result = run(value.projectPath);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /真人完整审片 Gate/);
});

test('build-export-package creates a valid ZIP and version receipt', () => {
  const value = fixture();
  const result = run(value.projectPath);
  assert.equal(result.status, 0, result.stderr);
  const zipPath = `${value.exportDir}.zip`;
  const receiptPath = `${value.exportDir}.package.json`;
  assert.ok(existsSync(zipPath) && statSync(zipPath).size > 0);
  assert.ok(existsSync(receiptPath) && statSync(receiptPath).size > 0);
  const unzip = spawnSync('/usr/bin/unzip', ['-t', zipPath], { encoding: 'utf8' });
  assert.equal(unzip.status, 0, unzip.stderr);
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.schemaVersion, 2);
  assert.equal(receipt.deliveryApprovalFingerprint, receipt.videoSha256);
  assert.equal(receipt.deliveryApprovedAt, 'now');
  assert.equal(receipt.deliveryApprovedBy, 'test-user');
  assert.equal(receipt.zipBytes, statSync(zipPath).size);
});
