import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  exportPackageReadiness,
  fileSha256,
  readExportPackageReceipt,
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
    schemaVersion: 2,
    projectId: 'project-1',
    projectFingerprint: 'project-fingerprint',
    packageContentFingerprint: 'package-content-fingerprint',
    renderedAt: 'now',
    renderManifestPath,
    renderManifestSha256: fileSha256(renderManifestPath),
    videoPath,
    videoSha256: fileSha256(videoPath),
    zipPath,
    zipBytes: 11,
    zipSha256: fileSha256(zipPath),
    deliveryApprovalFingerprint: 'rendition-bundle-fingerprint',
    deliveryApprovedAt: 'approved-now',
    deliveryApprovedBy: 'test-user',
    createdAt: 'now',
  };
  return { renderManifestPath, videoPath, zipPath, receipt };
}

function check(value: ReturnType<typeof fixture>) {
  return exportPackageReadiness({
    projectId: 'project-1',
    projectFingerprint: 'project-fingerprint',
    packageContentFingerprint: 'package-content-fingerprint',
    renderedAt: 'now',
    deliveryApproval: {
      status: 'approved',
      fingerprint: value.receipt.deliveryApprovalFingerprint,
      decidedAt: 'approved-now',
      decidedBy: 'test-user',
    },
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

test('accepts metadata-only project changes when production content is unchanged', () => {
  const value = fixture();
  value.receipt.productionContentFingerprint = 'content-fingerprint';
  assert.deepEqual(exportPackageReadiness({
    projectId: 'project-1',
    projectFingerprint: 'new-project-metadata-fingerprint',
    productionContentFingerprint: 'content-fingerprint',
    packageContentFingerprint: 'package-content-fingerprint',
    renderedAt: 'now',
    deliveryApproval: {
      status: 'approved',
      fingerprint: value.receipt.deliveryApprovalFingerprint,
      decidedAt: 'approved-now',
      decidedBy: 'test-user',
    },
    ...value,
  }), { ready: true, reason: '' });
});

test('rejects a package after rights or source-list metadata changes', () => {
  const value = fixture();
  assert.match(exportPackageReadiness({
    projectId: 'project-1',
    projectFingerprint: 'project-fingerprint',
    packageContentFingerprint: 'changed-package-content',
    renderedAt: 'now',
    deliveryApproval: {
      status: 'approved',
      fingerprint: value.receipt.deliveryApprovalFingerprint,
      decidedAt: 'approved-now',
      decidedBy: 'test-user',
    },
    ...value,
  }).reason, /来源、权利或发布素材已变化/);
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

test('rejects a package without current human delivery approval', () => {
  const value = fixture();
  assert.match(exportPackageReadiness({
    projectId: 'project-1',
    projectFingerprint: 'project-fingerprint',
    renderedAt: 'now',
    deliveryApproval: {
      status: 'pending', fingerprint: '', decidedAt: '', decidedBy: '',
    },
    ...value,
  }).reason, /真人完整审片批准/);
});

test('rejects a package after delivery approval changes', () => {
  const value = fixture();
  assert.match(exportPackageReadiness({
    projectId: 'project-1',
    projectFingerprint: 'project-fingerprint',
    renderedAt: 'now',
    deliveryApproval: {
      status: 'approved',
      fingerprint: value.receipt.deliveryApprovalFingerprint,
      decidedAt: 'approved-later',
      decidedBy: 'another-user',
    },
    ...value,
  }).reason, /未绑定当前真人交付批准/);
});

test('does not treat a legacy v1 receipt as human delivery approval', () => {
  const value = fixture();
  const receiptPath = join(value.zipPath, '..', 'legacy-receipt.json');
  writeFileSync(receiptPath, `${JSON.stringify({ ...value.receipt, schemaVersion: 1 })}\n`);
  assert.equal(readExportPackageReceipt(receiptPath), null);
});
