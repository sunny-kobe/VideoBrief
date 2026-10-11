import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('review package CLI rejects stale inputs before reusing frames and preserves valid acceptance', () => {
  const dir = mkdtempSync(join(tmpdir(), 'videobrief-review-cli-'));
  try {
    const brief = join(dir, 'project.json');
    const video = join(dir, 'video.mp4');
    const manifestPath = join(dir, 'render-manifest.json');
    const packagePath = join(dir, 'review-work-package.json');
    const project = { id: 'fixture', title: '测试', scenes: [{ id: 's1', enabled: true }] };
    const text = JSON.stringify(project);
    writeFileSync(brief, text);
    writeFileSync(video, 'original-video-bytes');
    const frames = ['start', 'mid', 'end'].map(label => {
      const path = join(dir, `${label}.png`);
      writeFileSync(path, `frame-${label}`);
      return path;
    });
    const manifest = {
      projectId: 'fixture', briefPath: brief,
      projectFingerprint: createHash('sha256').update(text).digest('hex'),
      proof: { passed: true }, render: { duration: 3 }, artifacts: { outputVideo: video },
      acceptance: {
        videoSha256: createHash('sha256').update('original-video-bytes').digest('hex'),
        semantic: { status: 'passed', scenes: [{ sceneId: 's1', frames }] },
      },
    };
    const manifestText = JSON.stringify(manifest);
    writeFileSync(manifestPath, manifestText);
    const run = () => spawnSync(process.execPath, [resolve('scripts/build-review-work-package.mjs'), `--manifest=${manifestPath}`], { encoding: 'utf8' });
    writeFileSync(brief, JSON.stringify({ ...project, title: '新版本' }));
    const stale = run();
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /stale video/);
    assert.equal(existsSync(packagePath), false);
    writeFileSync(brief, text);
    writeFileSync(video, 'replaced-video-bytes');
    assert.match(run().stderr, /video bytes do not match/);
    assert.equal(existsSync(packagePath), false);
    writeFileSync(video, 'original-video-bytes');
    const valid = run();
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(JSON.parse(readFileSync(packagePath, 'utf8')).scenes[0].frames.length, 3);
    assert.equal(readFileSync(manifestPath, 'utf8'), manifestText);
    // Missing per-scene frames must go through the preparation validator, not silently reuse others.
    writeFileSync(frames[1], '');
    const incomplete = run();
    assert.notEqual(incomplete.status, 0);
    assert.match(incomplete.stderr, /Production timeline is missing/);
    assert.equal(readFileSync(manifestPath, 'utf8'), manifestText);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
