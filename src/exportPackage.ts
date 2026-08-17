import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ExportPackageReceipt {
  schemaVersion: 2;
  projectId: string;
  projectFingerprint: string;
  productionContentFingerprint?: string;
  packageContentFingerprint?: string;
  renderedAt: string;
  renderManifestPath: string;
  renderManifestSha256: string;
  videoPath: string;
  videoSha256: string;
  coverPath?: string;
  coverSha256?: string;
  zipPath: string;
  zipBytes: number;
  zipSha256: string;
  deliveryApprovalFingerprint: string;
  deliveryApprovedAt: string;
  deliveryApprovedBy: string;
  createdAt: string;
}

export interface ExportPackageDeliveryApproval {
  status: 'pending' | 'approved' | 'rejected';
  fingerprint: string;
  decidedAt: string;
  decidedBy: string;
}

export interface ExportPackageReadinessInput {
  projectId: string;
  projectFingerprint: string;
  productionContentFingerprint?: string;
  packageContentFingerprint?: string;
  renderedAt: string;
  renderManifestPath: string;
  videoPath: string;
  coverPath: string;
  zipPath: string;
  deliveryApproval: ExportPackageDeliveryApproval | null;
  receipt: ExportPackageReceipt | null;
}

export type ExportPackageReadiness =
  | { ready: true; reason: '' }
  | { ready: false; reason: string };

export function fileSha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function readExportPackageReceipt(path: string): ExportPackageReceipt | null {
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<ExportPackageReceipt>;
    if (
      value.schemaVersion !== 2
      || typeof value.projectId !== 'string'
      || typeof value.projectFingerprint !== 'string'
      || typeof value.renderedAt !== 'string'
      || typeof value.renderManifestPath !== 'string'
      || typeof value.renderManifestSha256 !== 'string'
      || typeof value.videoPath !== 'string'
      || typeof value.videoSha256 !== 'string'
      || (value.coverPath !== undefined && typeof value.coverPath !== 'string')
      || (value.coverSha256 !== undefined && typeof value.coverSha256 !== 'string')
      || typeof value.zipPath !== 'string'
      || typeof value.zipBytes !== 'number'
      || typeof value.zipSha256 !== 'string'
      || typeof value.deliveryApprovalFingerprint !== 'string'
      || typeof value.deliveryApprovedAt !== 'string'
      || typeof value.deliveryApprovedBy !== 'string'
      || typeof value.createdAt !== 'string'
    ) return null;
    return value as ExportPackageReceipt;
  } catch {
    return null;
  }
}

export function exportPackageReadiness(
  input: ExportPackageReadinessInput,
): ExportPackageReadiness {
  const receipt = input.receipt;
  if (!receipt) return { ready: false, reason: '导出包缺少当前版本收据，请重新渲染并打包。' };
  if (receipt.projectId !== input.projectId) {
    return { ready: false, reason: '导出包属于其他项目，请重新渲染并打包。' };
  }
  const projectMatches = input.productionContentFingerprint && receipt.productionContentFingerprint
    ? receipt.productionContentFingerprint === input.productionContentFingerprint
    : receipt.projectFingerprint === input.projectFingerprint;
  if (!projectMatches) {
    return { ready: false, reason: '导出包对应旧项目版本，请重新渲染并打包。' };
  }
  if (input.packageContentFingerprint) {
    if (!receipt.packageContentFingerprint) {
      return { ready: false, reason: '导出包缺少当前打包元数据指纹，请重新打包。' };
    }
    if (receipt.packageContentFingerprint !== input.packageContentFingerprint) {
      return { ready: false, reason: '导出包中的来源、权利或发布素材已变化，请重新打包。' };
    }
  }
  if (receipt.renderedAt !== input.renderedAt) {
    return { ready: false, reason: '导出包对应旧渲染版本，请重新渲染并打包。' };
  }

  const approval = input.deliveryApproval;
  if (!approval || approval.status !== 'approved') {
    return { ready: false, reason: '当前成片尚未通过真人完整审片批准。' };
  }
  if (
    !approval.fingerprint
    || receipt.deliveryApprovalFingerprint !== approval.fingerprint
    || receipt.deliveryApprovedAt !== approval.decidedAt
    || receipt.deliveryApprovedBy !== approval.decidedBy
  ) {
    return { ready: false, reason: '导出包未绑定当前真人交付批准，请重新批准并打包。' };
  }

  const expectedPaths = [
    [receipt.renderManifestPath, input.renderManifestPath],
    [receipt.videoPath, input.videoPath],
    ...(receipt.coverPath ? [[receipt.coverPath, input.coverPath]] : []),
    [receipt.zipPath, input.zipPath],
  ];
  if (expectedPaths.some(([recorded, current]) => resolve(recorded) !== resolve(current))) {
    return { ready: false, reason: '导出包产物路径与当前项目不一致，请重新渲染并打包。' };
  }
  if (
    !existsSync(input.renderManifestPath)
    || !existsSync(input.videoPath)
    || !existsSync(input.coverPath)
    || !existsSync(input.zipPath)
  ) {
    return { ready: false, reason: '导出包产物缺失，请重新渲染并打包。' };
  }
  if (statSync(input.zipPath).size !== receipt.zipBytes || receipt.zipBytes <= 0) {
    return { ready: false, reason: '导出 ZIP 大小与当前版本收据不一致，请重新渲染并打包。' };
  }
  if (fileSha256(input.renderManifestPath) !== receipt.renderManifestSha256) {
    return { ready: false, reason: '导出包对应的渲染清单已过期，请重新渲染并打包。' };
  }
  if (fileSha256(input.videoPath) !== receipt.videoSha256) {
    return { ready: false, reason: '导出包对应的成片已变化，请重新渲染并打包。' };
  }
  if (receipt.coverSha256 && fileSha256(input.coverPath) !== receipt.coverSha256) {
    return { ready: false, reason: '导出包对应的正式封面已变化，请重新审查并打包。' };
  }
  if (fileSha256(input.zipPath) !== receipt.zipSha256) {
    return { ready: false, reason: '导出 ZIP 内容与当前版本收据不一致，请重新渲染并打包。' };
  }
  return { ready: true, reason: '' };
}
