import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReviewWorkPackage,
  renderReviewWorkPackageHtml,
} from '../scripts/lib/review-work-package.mjs';
import { resolveReviewFramePath } from '../src/reviewWorkPackageServer';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('review package aligns canonical meaning, selected windows and start-mid-end evidence', () => {
  const project = {
    id: 'review-fixture', title: '审片包测试',
    sources: [{ id: 'source-01', label: '自有录屏', rightsStatus: 'cleared' }],
    scenes: [{
      id: 'scene-01', enabled: true, title: '展示结果', subtitle: '真实结果已经出现', narration: '这里展示真实结果。',
      visualRequirement: '画面必须显示结果', sourceId: 'source-01', sourceStart: 4, sourceEnd: 8,
      selectedCandidateId: 'candidate-01', selectionStatus: 'codex_reviewed',
      candidates: [{ id: 'candidate-01', sourceId: 'source-01', sourceStart: 4, sourceEnd: 8, matchReason: '结果直接可见', rightsStatus: 'cleared' }],
    }],
  };
  const manifest = {
    projectId: 'review-fixture', render: { duration: 4 }, artifacts: { publicRender: '/tmp/final.mp4' },
    scenes: [{ id: 'scene-01', start: 0, end: 4 }],
    proof: { passed: true, quality: { warnings: [], freezeIntervals: [{ start: 1, end: 2, duration: 1 }] } },
    acceptance: { videoSha256: 'video-sha', semantic: { scenes: [{ sceneId: 'scene-01', frames: ['/tmp/start.png', '/tmp/mid.png', '/tmp/end.png'] }] } },
  };
  const reviewPackage = buildReviewWorkPackage(project, manifest);
  assert.equal(reviewPackage.scenes[0].frames.length, 3);
  assert.equal(reviewPackage.scenes[0].matchReason, '结果直接可见');
  assert.match(reviewPackage.scenes[0].risks.join('；'), /冻结提示/);
  const html = renderReviewWorkPackageHtml(reviewPackage, (path) => `file://${path}`);
  assert.match(html, /这里展示真实结果/);
  assert.match(html, /画面必须显示结果/);
  assert.match(html, /file:\/\/\/tmp\/mid\.png/);
  assert.match(html, /rel="icon" href="\/icon\.svg"/);
});

test('review frame access only allows files listed in the current package', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'videobrief-review-package-'));
  const frameDir = join(workDir, 'semantic-proof');
  const allowedPath = join(frameDir, 'scene-01-mid.png');
  mkdirSync(frameDir);
  writeFileSync(allowedPath, 'png');
  const reviewPackage = {
    projectId: 'review-fixture', videoPath: '/tmp/final.mp4', videoSha256: 'video-sha',
    scenes: [{ frames: [allowedPath] }],
  };
  assert.equal(resolveReviewFramePath(workDir, reviewPackage, 'scene-01-mid.png'), allowedPath);
  assert.throws(
    () => resolveReviewFramePath(workDir, reviewPackage, 'scene-02-mid.png'),
    /不属于当前审片工作包/,
  );
  assert.throws(
    () => resolveReviewFramePath(workDir, reviewPackage, '../project.json'),
    /名称无效/,
  );
});
