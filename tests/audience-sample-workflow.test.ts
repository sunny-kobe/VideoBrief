import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  audienceSampleWorkflow,
  parseAudienceSampleWorkflow,
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
