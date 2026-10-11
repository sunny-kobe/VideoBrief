import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  audienceSampleWorkflow,
  parseAudienceSampleWorkflow,
  parseAudienceSampleStyleExperiment,
} from '../src/audienceSampleWorkflow';

test('audience sample workflow keeps a research-only prompt, Topic Gate and unique reference projects', () => {
  assert.equal(audienceSampleWorkflow.schemaVersion, 1);
  assert.equal(audienceSampleWorkflow.stages.at(-1)?.gate, 'Topic Gate');
  assert.ok(audienceSampleWorkflow.samples.length > 0);
  assert.equal(
    new Set(audienceSampleWorkflow.samples.map((sample) => sample.projectId)).size,
    audienceSampleWorkflow.samples.length,
  );
  assert.ok(existsSync(audienceSampleWorkflow.kickoffPromptPath));
  assert.ok(existsSync(audienceSampleWorkflow.playbookPath));
  assert.ok(existsSync(audienceSampleWorkflow.styleExperimentPath));
  assert.ok(existsSync(audienceSampleWorkflow.performanceReviewPath));
  for (const sample of audienceSampleWorkflow.samples) {
    assert.ok(existsSync(`content/projects/${sample.projectId}/project.json`));
  }

  const prompt = readFileSync(audienceSampleWorkflow.kickoffPromptPath, 'utf8');
  assert.match(prompt, /日常有因下一阶段命题调研/);
  assert.match(prompt, /前 30 天主平台：B站/);
  assert.match(prompt, /BV1uYuG6rEVz/);
  assert.match(prompt, /BV1TYuG6rEQ8/);
  assert.match(prompt, /BV1bYuG6rEii/);
  assert.match(prompt, /停在 Topic Gate/);
  assert.match(prompt, /不创建 canonical project/);
  assert.match(prompt, /不渲染/);
  assert.match(prompt, /不上传/);
  assert.match(prompt, /不发布/);
  assert.doesNotMatch(prompt, /在同一任务中继续/);

  const experiment = parseAudienceSampleStyleExperiment(JSON.parse(
    readFileSync(audienceSampleWorkflow.styleExperimentPath, 'utf8'),
  ));
  assert.equal(experiment.status, 'active');
  assert.equal(experiment.id, 'suspense-stakes-dual-format-v2');
  assert.equal(experiment.reviewAfterPublishedVideos, 4);
  assert.equal(experiment.schemaVersion, 2);
  assert.equal(experiment.formats.length, 2);
  assert.deepEqual(experiment.formats.map((format) => format.slotsPerCycle), [2, 2]);
  assert.deepEqual(experiment.measurement.snapshotHours, [2, 24, 72, 168]);
  assert.equal(experiment.measurement.reviewPath, audienceSampleWorkflow.performanceReviewPath);
  assert.match(experiment.audiencePromise, /谁得利、谁付钱/);
  assert.match(experiment.formats[0].opening, /真实对象/);
  assert.equal(experiment.measurement.targets.maxThreeSecondBounceRate, 30);
  assert.match(experiment.productionDefaults.cover, /8-14 字/);
});

test('audience sample workflow rejects duplicate projects and invalid topic scores', () => {
  const duplicate = {
    ...audienceSampleWorkflow,
    samples: [audienceSampleWorkflow.samples[0], audienceSampleWorkflow.samples[0]],
  };
  assert.throws(() => parseAudienceSampleWorkflow(duplicate), /参考项目 id 不能重复/);

  const invalidScore = {
    ...audienceSampleWorkflow,
    samples: [{ ...audienceSampleWorkflow.samples[0], topicScore: 41, topicScoreMax: 40 }],
  };
  assert.throws(() => parseAudienceSampleWorkflow(invalidScore), /Topic Gate 评分无效/);
});

test('audience sample style experiment rejects reversed format durations and unordered snapshots', () => {
  const experiment = parseAudienceSampleStyleExperiment(JSON.parse(
    readFileSync(audienceSampleWorkflow.styleExperimentPath, 'utf8'),
  ));
  assert.throws(() => parseAudienceSampleStyleExperiment({
    ...experiment,
    formats: experiment.formats.map((format, index) => index === 0
      ? { ...format, minDurationSeconds: 90, maxDurationSeconds: 60 }
      : format),
  }), /时长上限不能小于下限/);
  assert.throws(() => parseAudienceSampleStyleExperiment({
    ...experiment,
    measurement: {
      ...experiment.measurement,
      snapshotHours: [24, 2],
    },
  }), /snapshotHours 必须严格递增/);
});

test('audience sample style experiment requires format slots to match the review cycle', () => {
  const experiment = parseAudienceSampleStyleExperiment(JSON.parse(
    readFileSync(audienceSampleWorkflow.styleExperimentPath, 'utf8'),
  ));
  assert.throws(() => parseAudienceSampleStyleExperiment({
    ...experiment,
    formats: experiment.formats.map((format, index) => index === 0
      ? { ...format, slotsPerCycle: 1 }
      : format),
  }), /格式槽位总数必须等于复盘视频数/);
});
