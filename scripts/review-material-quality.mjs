import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildMaterialQualityReview,
  materialQualityGateReadiness,
} from './lib/material-quality-gate.mjs';

function arg(name) {
  return process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';
}

const briefPath = resolve(arg('brief'));
const reviewPath = resolve(arg('review'));
const reviewer = arg('reviewer').trim();
const apply = process.argv.includes('--apply');

if (!arg('brief') || !arg('review') || !reviewer) {
  throw new Error('用法：node scripts/review-material-quality.mjs --brief=<project.json> --review=<report.json> --reviewer=<name> [--apply]');
}

const project = JSON.parse(readFileSync(briefPath, 'utf8'));
const report = JSON.parse(readFileSync(reviewPath, 'utf8'));
const materialQualityReview = buildMaterialQualityReview(project, report, reviewer);
const next = structuredClone(project);
next.materialQualityReview = materialQualityReview;
const readiness = materialQualityGateReadiness(next);

if (apply) {
  next.status = 'review';
  if (next.workflow?.deliveryApproval) {
    next.workflow.deliveryApproval = {
      status: 'pending', decidedAt: '', decidedBy: '', note: '', fingerprint: '',
    };
  }
  if (next.workflow?.publication?.approval) {
    next.workflow.publication.approval = {
      status: 'pending', decidedAt: '', decidedBy: '', note: '', fingerprint: '',
    };
  }
  const temporaryPath = `${briefPath}.material-quality-${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(temporaryPath, briefPath);
}

console.log(JSON.stringify({
  projectId: project.id,
  applied: apply,
  status: materialQualityReview.status,
  ready: readiness.ready,
  reviewedSceneCount: readiness.reviewedSceneCount,
  issues: readiness.issues,
}, null, 2));
