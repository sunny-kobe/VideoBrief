import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildMaterialQualityReview,
  materialQualityGateReadiness,
} from './lib/material-quality-gate.mjs';
import {
  assertCurrentVoiceoverPreflight,
  readVoiceoverPreflight,
} from './lib/voiceover-preflight.mjs';
import { resolveProjectRenditions } from './lib/video-renditions.mjs';
import { resolveVoiceoverConfig } from '../src/voiceoverProvider.mjs';

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
const renditions = resolveProjectRenditions(project);
const voiceRenderConfig = {
  ...(project.render ?? {}),
  ...(process.env.VOICEOVER_VOICE ? { voice: process.env.VOICEOVER_VOICE } : {}),
  ...(process.env.VOICEOVER_RATE ? { rate: Number(process.env.VOICEOVER_RATE) } : {}),
};
const voiceConfig = resolveVoiceoverConfig(voiceRenderConfig);
const voiceGenerationMode = ['batch', 'per-scene'].includes(project.render?.voiceGenerationMode)
  ? project.render.voiceGenerationMode
  : 'auto';
const voiceoverPreflights = renditions.map((rendition) => {
  const path = resolve(rendition.workDir, 'voiceover-preflight.json');
  return { rendition, path, report: readVoiceoverPreflight(path) };
});
if (apply) {
  for (const preflight of voiceoverPreflights) {
    assertCurrentVoiceoverPreflight({
      project,
      report: preflight.report,
      voiceConfig,
      voiceGenerationMode,
      rendition: preflight.rendition,
    });
  }
}
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
  voiceoverPreflights: voiceoverPreflights.map((preflight) => ({
    renditionId: preflight.rendition.id,
    path: preflight.path,
    status: preflight.report?.status ?? 'missing',
  })),
  issues: readiness.issues,
}, null, 2));
