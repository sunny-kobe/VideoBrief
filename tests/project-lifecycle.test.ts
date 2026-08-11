import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  deriveProjectDisplayStage,
  projectNextHref,
  type ProjectDisplayStageInput,
} from '../src/projectLifecycle';
import {
  buildProjectDeletionPlan,
  moveProjectToTrash,
  projectStorageContext,
  updateProjectLifecycle,
} from '../src/projectLifecycleServer';
import {
  enqueueProjectPlanningJob,
  listProjectPlanningJobs,
  removeProjectPlanningJobsForProject,
  updateProjectPlanningJob,
} from '../src/projectPlanningQueue';
import {
  enqueueRenderQueueJob,
  listRenderQueueJobs,
  removeRenderQueueJobsForProject,
  updateRenderQueueJob,
} from '../src/renderQueue';
import {
  enqueueSourceProcessingJob,
  listSourceProcessingJobs,
  removeSourceProcessingJobsForProject,
  updateSourceProcessingJob,
} from '../src/sourceProcessingQueue';
import { normalizeBrief } from '../src/shortVideoProjectServer';
import type { ShortVideoProject } from '../src/shortVideoBrief';
import {
  packageContentFingerprint,
  productionContentFingerprint,
} from '../scripts/lib/production-content-fingerprint.mjs';

function project(id = 'lifecycle-fixture') {
  return normalizeBrief({
    schemaVersion: 3,
    id,
    title: '生命周期测试项目',
    format: 'video_project',
    status: 'draft',
    technical_status: 'not_rendered',
    rights_status: 'cleared',
    publication_status: 'draft-unpublished',
    market_status: 'none',
    brief: {
      objective: '验证项目生命周期',
      audience: '测试用户',
      platform: '横版视频',
      aspectRatio: '16:9',
      targetDurationSeconds: 30,
      tone: '清晰',
      style: '克制',
      reference: '',
      coreMessage: '生命周期与生产状态彼此独立',
      cta: '',
      prohibitedMaterial: '',
    },
    production: {
      trackingStartedAt: '2026-08-06T01:00:00.000Z',
      updatedAt: '2026-08-06T01:00:00.000Z',
      researchReviewedAt: '',
      firstRenderCompletedAt: '',
      lastRenderCompletedAt: '',
      sourceImportCount: 0,
      manualSaveCount: 0,
      renderAttemptCount: 0,
      renderFailureCount: 0,
      lastRenderStartedAt: '',
      lastRenderError: '',
      reusedSourceIds: [],
    },
    workflow: {
      schemaVersion: 1,
      origin: { kind: 'manual', runId: '', candidateId: '', sourceUrl: '', score: null, summary: '' },
      topicApproval: { status: 'pending', decidedAt: '', decidedBy: '', note: '', fingerprint: '' },
      researchApproval: { status: 'pending', decidedAt: '', decidedBy: '', note: '', fingerprint: '' },
      deliveryApproval: { status: 'pending', decidedAt: '', decidedBy: '', note: '', fingerprint: '' },
      publication: {
        approval: { status: 'pending', decidedAt: '', decidedBy: '', note: '', fingerprint: '' },
        platform: '', publishedUrl: '', publishedAt: '', videoSha256: '', packageSha256: '',
      },
      market: { decision: 'pending', decidedAt: '', decidedBy: '', note: '', evidence: [] },
    },
    sources: [],
    scenes: [],
    outputs: {
      outputVideo: `output/videos/${id}.mp4`,
      publicRender: `public/renders/${id}.mp4`,
      workDir: `output/videos/${id}-work`,
      exportDir: `output/exports/${id}`,
      coverImage: `output/exports/${id}/cover.png`,
      platformCopy: `output/exports/${id}/platform-copy.json`,
      sourceList: `output/exports/${id}/source-list.json`,
      projectSnapshot: `output/exports/${id}/project.snapshot.json`,
    },
  });
}

function stageInput(projectValue: ShortVideoProject): ProjectDisplayStageInput {
  return {
    project: projectValue,
    render: { state: 'missing', label: '尚未渲染', message: '等待继续制作' },
    workflowStages: [{
      id: 'topic', label: '最终命题', status: 'waiting', message: '等待用户批准命题。', responsibility: 'human_gate',
    }],
    workflowFailure: null,
    queues: [],
  };
}

test('homepage stage priority is archived, failure, active queue, review, completed, then attention', () => {
  const archived = project();
  archived.lifecycle = { state: 'archived', archivedAt: 'now', archivedBy: 'user', archiveReason: '' };
  archived.rights_status = 'blocked';
  assert.equal(deriveProjectDisplayStage({
    ...stageInput(archived),
    queues: [{ kind: 'render', state: 'running' }],
  }).stage, 'archived');

  const blocked = project();
  blocked.rights_status = 'blocked';
  assert.equal(deriveProjectDisplayStage({
    ...stageInput(blocked),
    queues: [{ kind: 'render', state: 'running' }],
  }).stage, 'needs_attention');

  assert.equal(deriveProjectDisplayStage({
    ...stageInput(project()),
    queues: [{ kind: 'project-planning', state: 'queued' }],
  }).stage, 'in_progress');

  const ready = project();
  assert.equal(deriveProjectDisplayStage({
    ...stageInput(ready),
    render: { state: 'ready', label: '自动验收通过', message: '' },
    workflowStages: [{
      id: 'acceptance', label: '成片验收', status: 'ready', message: '等待真人审片', responsibility: 'human_gate',
    }],
  }).stage, 'awaiting_review');

  const prematureReview = deriveProjectDisplayStage({
    ...stageInput(ready),
    render: { state: 'ready', label: '自动验收通过', message: '' },
    workflowStages: [
      { id: 'topic', label: '最终命题', status: 'waiting', message: '等待用户批准命题。', responsibility: 'human_gate' },
      { id: 'acceptance', label: '成片验收', status: 'ready', message: '等待真人审片', responsibility: 'human_gate' },
    ],
  });
  assert.equal(prematureReview.stage, 'needs_attention');
  assert.equal(prematureReview.nextWorkflowStage, 'topic');
  assert.match(projectNextHref(ready.id, prematureReview), /advanced=1&view=sources/);

  assert.equal(deriveProjectDisplayStage({
    ...stageInput(ready),
    render: { state: 'ready', label: '自动验收通过', message: '' },
    workflowStages: [{
      id: 'acceptance', label: '成片验收', status: 'approved', message: '已批准', responsibility: 'human_gate',
    }],
  }).stage, 'completed');

  assert.equal(deriveProjectDisplayStage(stageInput(project())).stage, 'needs_attention');
});

test('legacy project normalizes to active lifecycle and landscape defaults', () => {
  const legacy = normalizeBrief({ id: 'legacy-project', title: 'Legacy' });
  assert.equal(legacy.lifecycle?.state, 'active');
  assert.equal(legacy.brief.aspectRatio, '16:9');
  assert.deepEqual([legacy.render.width, legacy.render.height], [1920, 1080]);
  const historicalPortrait = normalizeBrief({
    id: 'legacy-portrait', title: 'Legacy portrait', render: { width: 1080, height: 1920 } as ShortVideoProject['render'],
  });
  assert.equal(historicalPortrait.brief.aspectRatio, '9:16');
});

function writeProject(root: string, projectValue: ShortVideoProject) {
  const directory = join(root, 'content/projects', projectValue.id);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'project.json');
  writeFileSync(path, `${JSON.stringify(projectValue, null, 2)}\n`);
  return path;
}

function tempContext(root: string, now = new Date('2026-08-06T08:00:00.000Z')) {
  return projectStorageContext({ rootDir: root, now: () => now });
}

test('archive and restore preserve production/package fingerprints and upgrade a current legacy manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-lifecycle-'));
  const fixture = project();
  const projectPath = writeProject(root, fixture);
  const raw = readFileSync(projectPath, 'utf8');
  const manifestPath = join(root, fixture.outputs.workDir, 'render-manifest.json');
  mkdirSync(join(root, fixture.outputs.workDir), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    projectId: fixture.id,
    projectFingerprint: createHash('sha256').update(raw).digest('hex'),
    renderedAt: '2026-08-06T01:00:00.000Z',
    briefPath: projectPath,
    render: { width: 1920, height: 1080, fps: 30, duration: 30 },
    artifacts: {},
    scenes: [],
  }, null, 2)}\n`);
  const beforeRender = productionContentFingerprint(fixture);
  const beforePackage = packageContentFingerprint(fixture);

  const archived = updateProjectLifecycle(fixture.id, {
    action: 'archive', archivedBy: 'test-user', archiveReason: '暂时收起',
  }, tempContext(root));
  assert.equal(archived.lifecycle?.state, 'archived');
  assert.equal(productionContentFingerprint(archived), beforeRender);
  assert.equal(packageContentFingerprint(archived), beforePackage);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.productionContentFingerprint, beforeRender);

  const restored = updateProjectLifecycle(fixture.id, {
    action: 'restore', restoredBy: 'test-user',
  }, tempContext(root));
  assert.equal(restored.lifecycle?.state, 'active');
  assert.equal(restored.lifecycle?.archivedAt, '');
  assert.equal(productionContentFingerprint(restored), beforeRender);
  rmSync(root, { recursive: true, force: true });
});

test('deletion blocks active queues and exact workflow/showcase references', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-delete-block-'));
  const fixture = project('delete-block-fixture');
  const projectPath = writeProject(root, fixture);
  const context = tempContext(root);
  enqueueRenderQueueJob(context.renderQueuePath, { projectId: fixture.id, briefPath: projectPath });
  let plan = buildProjectDeletionPlan(fixture.id, context);
  assert.equal(plan.canDelete, false);
  assert.ok(plan.blockers.some((blocker) => blocker.code === 'active_queue'));

  removeRenderQueueJobsForProject(context.renderQueuePath, fixture.id);
  const workflowPath = join(root, 'content/workflows/showcase.json');
  mkdirSync(join(root, 'content/workflows'), { recursive: true });
  writeFileSync(workflowPath, JSON.stringify({ samples: [{ projectId: fixture.id }] }));
  plan = buildProjectDeletionPlan(fixture.id, context);
  assert.ok(plan.blockers.some((blocker) => blocker.code === 'referenced' && blocker.source?.endsWith('showcase.json')));
  rmSync(root, { recursive: true, force: true });
});

test('deletion protects the system compatibility fixture', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-system-fixture-'));
  writeProject(root, project('codex-app-explainer'));
  const plan = buildProjectDeletionPlan('codex-app-explainer', tempContext(root));
  assert.equal(plan.canDelete, false);
  assert.ok(plan.blockers.some((blocker) => blocker.source?.includes('DEFAULT_PROJECT_ID')));
  rmSync(root, { recursive: true, force: true });
});

test('deletion blocks path traversal and dependencies referenced by another project', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-delete-path-'));
  const fixture = project('unsafe-delete-fixture');
  fixture.outputs.outputVideo = '../outside.mp4';
  writeProject(root, fixture);
  let plan = buildProjectDeletionPlan(fixture.id, tempContext(root));
  assert.ok(plan.blockers.some((blocker) => blocker.code === 'unsafe_path'));
  assert.ok(plan.targets.every((target) => !target.path.endsWith('outside.mp4')));

  const safeFixture = project('shared-delete-fixture');
  writeProject(root, safeFixture);
  const dependent = project('dependent-project');
  dependent.sources = [{
    id: 'source-01', label: '共享素材', sourceType: 'image', materialRole: 'evidence', originUrl: '',
    assetPath: `public/project-assets/${safeFixture.id}/shared.png`, originalFileName: 'shared.png', mimeType: 'image/png', bytes: 1,
    importedAt: '', publishedAt: '', verificationStatus: 'verified', rightsStatus: 'cleared', rightsNote: '', contentHash: 'hash',
    reusedFrom: { projectId: safeFixture.id, sourceId: 'source-01' },
    processing: { status: 'completed', stage: 'completed', attempts: 1, inputHash: 'hash', startedAt: '', completedAt: '', error: '', model: '', promptVersion: '', cacheHit: false },
    analysis: { extractedText: '', visualDescription: '', hierarchicalSummary: '', transcript: [], facts: [], uncertainties: [], chapters: [] },
  }];
  writeProject(root, dependent);
  mkdirSync(join(root, 'public/project-assets', safeFixture.id), { recursive: true });
  writeFileSync(join(root, 'public/project-assets', safeFixture.id, 'shared.png'), 'x');
  plan = buildProjectDeletionPlan(safeFixture.id, tempContext(root));
  assert.ok(plan.blockers.some((blocker) => blocker.code === 'referenced' && blocker.source?.includes('dependent-project')));
  rmSync(root, { recursive: true, force: true });
});

test('deletion accepts exact legacy evidence files but rejects shared output roots', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-delete-evidence-'));
  const fixture = project('legacy-evidence-fixture');
  const evidencePath = 'output/history-run/legacy-evidence/material-evidence/scene-01.png';
  fixture.materialQualityReview = {
    schemaVersion: 1,
    status: 'passed',
    reviewedAt: 'now',
    reviewer: 'test-user',
    reviewScope: 'fixture',
    sceneReviews: [{
      sceneId: 'scene-01', sceneFingerprint: 'fingerprint',
      candidate: { sourceId: 'source-01', sourceStart: 0, sourceEnd: 1 },
      visibleClaim: '测试证据', evidenceRole: 'primary-evidence',
      narrationMatch: { score: 5, reason: '匹配' },
      readability: { desktop: 'passed', mobile: 'passed', criticalText: [], reason: '可读' },
      temporalCompleteness: { status: 'passed', reason: '完整' },
      stability: { status: 'stable', motionNecessary: false, reason: '稳定' },
      uniqueness: { status: 'unique', reason: '唯一' },
      decision: 'accept', decisionReasons: [], evidence: [evidencePath],
    }],
  };
  writeProject(root, fixture);
  mkdirSync(join(root, evidencePath, '..'), { recursive: true });
  writeFileSync(join(root, evidencePath), 'evidence');
  let plan = buildProjectDeletionPlan(fixture.id, tempContext(root));
  assert.equal(plan.canDelete, true);
  assert.ok(plan.targets.some((target) => target.relativePath === evidencePath));

  fixture.materialQualityReview.sceneReviews[0].evidence.push('output/voice-cache/shared.mp3');
  writeProject(root, fixture);
  mkdirSync(join(root, 'output/voice-cache'), { recursive: true });
  writeFileSync(join(root, 'output/voice-cache/shared.mp3'), 'shared');
  plan = buildProjectDeletionPlan(fixture.id, tempContext(root));
  assert.ok(plan.blockers.some((blocker) => blocker.code === 'unsafe_path' && blocker.source?.includes('voice-cache')));
  assert.ok(plan.targets.every((target) => !target.relativePath.includes('voice-cache')));
  rmSync(root, { recursive: true, force: true });
});

test('same-project metadata does not block deletion, while descendant references from another project do', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-delete-reference-'));
  const fixture = project('reference-scope-fixture');
  writeProject(root, fixture);
  writeFileSync(
    join(root, 'content/projects', fixture.id, 'walkthrough.json'),
    JSON.stringify({ projectId: fixture.id }),
  );
  let plan = buildProjectDeletionPlan(fixture.id, tempContext(root));
  assert.equal(plan.canDelete, true);

  const dependent = project('descendant-reference-project');
  dependent.sources = [{
    id: 'source-01', label: '共享素材', sourceType: 'image', materialRole: 'evidence', originUrl: '',
    assetPath: `public/project-assets/${fixture.id}/nested/shared.png`, originalFileName: 'shared.png', mimeType: 'image/png', bytes: 1,
    importedAt: '', publishedAt: '', verificationStatus: 'verified', rightsStatus: 'cleared', rightsNote: '', contentHash: 'hash',
    reusedFrom: { projectId: '', sourceId: '' },
    processing: { status: 'completed', stage: 'completed', attempts: 1, inputHash: 'hash', startedAt: '', completedAt: '', error: '', model: '', promptVersion: '', cacheHit: false },
    analysis: { extractedText: '', visualDescription: '', hierarchicalSummary: '', transcript: [], facts: [], uncertainties: [], chapters: [] },
  }];
  writeProject(root, dependent);
  mkdirSync(join(root, 'public/project-assets', fixture.id, 'nested'), { recursive: true });
  writeFileSync(join(root, 'public/project-assets', fixture.id, 'nested/shared.png'), 'shared');
  plan = buildProjectDeletionPlan(fixture.id, tempContext(root));
  assert.ok(plan.blockers.some((blocker) => blocker.code === 'referenced' && blocker.source?.includes(dependent.id)));
  rmSync(root, { recursive: true, force: true });
});

test('deletion plan moves only project-owned allowlisted paths, preserves shared caches, and writes a receipt', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-delete-success-'));
  const fixture = project('delete-success-fixture');
  const projectPath = writeProject(root, fixture);
  const context = tempContext(root);
  const ownedFiles = [
    join(root, 'public/project-assets', fixture.id, 'source.png'),
    join(root, fixture.outputs.outputVideo),
    join(root, fixture.outputs.publicRender),
    join(root, fixture.outputs.workDir, 'render-manifest.json'),
    join(root, fixture.outputs.exportDir, 'cover.png'),
    join(root, `${fixture.outputs.exportDir}.zip`),
    join(root, 'output/source-processing', fixture.id, 'source-01', 'result.json'),
    join(root, 'output/source-review', fixture.id, 'review.json'),
    join(root, 'output/scene-information-layers', fixture.id, 'scene-01.json'),
    join(root, 'output/playwright', fixture.id, 'desktop.png'),
  ];
  for (const path of ownedFiles) {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, path.endsWith('render-manifest.json') ? JSON.stringify({
      schemaVersion: 1, projectId: fixture.id, projectFingerprint: '', renderedAt: '', briefPath: projectPath,
      render: { width: 1920, height: 1080, fps: 30, duration: 1 }, artifacts: {}, scenes: [],
    }) : 'owned');
  }
  const sharedCache = join(root, 'output/voice-cache/shared.mp3');
  mkdirSync(join(root, 'output/voice-cache'), { recursive: true });
  writeFileSync(sharedCache, 'shared');

  const renderJob = enqueueRenderQueueJob(context.renderQueuePath, { projectId: fixture.id, briefPath: projectPath }).job;
  updateRenderQueueJob(context.renderQueuePath, renderJob.jobId, { state: 'completed', stage: 'completed', completedAt: 'now' });
  const sourceJob = enqueueSourceProcessingJob(context.sourceProcessingQueuePath, { projectId: fixture.id, sourceId: 'source-01', briefPath: projectPath }).job;
  updateSourceProcessingJob(context.sourceProcessingQueuePath, sourceJob.jobId, { state: 'completed', stage: 'completed', completedAt: 'now' });
  const planningJob = enqueueProjectPlanningJob(context.projectPlanningQueuePath, { projectId: fixture.id, briefPath: projectPath }).job;
  updateProjectPlanningJob(context.projectPlanningQueuePath, planningJob.jobId, { state: 'completed', stage: 'completed', completedAt: 'now' });

  const plan = buildProjectDeletionPlan(fixture.id, context);
  assert.equal(plan.canDelete, true);
  assert.deepEqual(plan.queueRecords, { render: 1, sourceProcessing: 1, projectPlanning: 1 });
  assert.ok(plan.totals.files >= ownedFiles.length);
  assert.ok(plan.targets.some((target) => target.relativePath === `output/source-review/${fixture.id}`));
  assert.ok(plan.targets.some((target) => target.relativePath === `output/scene-information-layers/${fixture.id}`));
  assert.ok(plan.targets.every((target) => !target.path.includes('voice-cache')));
  const receipt = moveProjectToTrash(fixture.id, fixture.id, context);
  assert.equal(receipt.mode, 'trash');
  assert.deepEqual(receipt.removedQueueRecords, { render: 1, sourceProcessing: 1, projectPlanning: 1 });
  assert.equal(existsSync(projectPath), false);
  assert.equal(existsSync(sharedCache), true);
  assert.equal(existsSync(join(receipt.trashDirectory, 'deletion-receipt.json')), true);
  assert.equal(listRenderQueueJobs(context.renderQueuePath).some((job) => job.projectId === fixture.id), false);
  assert.equal(listSourceProcessingJobs(context.sourceProcessingQueuePath).some((job) => job.projectId === fixture.id), false);
  assert.equal(listProjectPlanningJobs(context.projectPlanningQueuePath).some((job) => job.projectId === fixture.id), false);
  rmSync(root, { recursive: true, force: true });
});
