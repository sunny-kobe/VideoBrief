import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  exportPackageReadiness,
  fileSha256,
  type ExportPackageReceipt,
} from '../src/exportPackage';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-export-package-'));
  const renderManifestPath = join(root, 'render-manifest.json');
  const videoPath = join(root, 'current.mp4');
  const zipPath = join(root, 'current.zip');
  writeFileSync(renderManifestPath, '{"renderedAt":"now"}\n');
  writeFileSync(videoPath, 'current-video');
  writeFileSync(zipPath, 'current-zip');
  const receipt: ExportPackageReceipt = {
    schemaVersion: 1,
    projectId: 'project-1',
    projectFingerprint: 'project-fingerprint',
    renderedAt: 'now',
    renderManifestPath,
    renderManifestSha256: fileSha256(renderManifestPath),
    videoPath,
    videoSha256: fileSha256(videoPath),
    zipPath,
    zipBytes: 11,
    zipSha256: fileSha256(zipPath),
    createdAt: 'now',
  };
  return { renderManifestPath, videoPath, zipPath, receipt };
}

function check(value: ReturnType<typeof fixture>) {
  return exportPackageReadiness({
    projectId: 'project-1',
    projectFingerprint: 'project-fingerprint',
    renderedAt: 'now',
    ...value,
  });
}

test('accepts a package receipt tied to the current project, render and ZIP bytes', () => {
  assert.deepEqual(check(fixture()), { ready: true, reason: '' });
});

test('rejects a ZIP from an older project fingerprint', () => {
  const value = fixture();
  value.receipt.projectFingerprint = 'old-project-fingerprint';
  assert.match(check(value).reason, /旧项目版本/);
});

test('rejects a ZIP after its bytes change', () => {
  const value = fixture();
  writeFileSync(value.zipPath, 'stale-zip');
  assert.match(check(value).reason, /大小|内容/);
});

test('rejects a package after the current render manifest changes', () => {
  const value = fixture();
  writeFileSync(value.renderManifestPath, '{"renderedAt":"later"}\n');
  assert.match(check(value).reason, /渲染清单已过期/);
});
