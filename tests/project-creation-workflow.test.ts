import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import test from 'node:test';

import {
  briefPathFor,
  createProject,
} from '../src/shortVideoProjectServer';
import { topicApprovalFingerprint } from '../scripts/lib/production-workflow-contract.mjs';

function input(id: string) {
  return {
    id,
    title: '项目创建命题 Gate 测试',
    brief: {
      objective: '确认创建项目不会伪造人工命题批准',
      audience: '测试人员',
      coreMessage: '只有明确的人工决策才能批准最终命题',
      aspectRatio: '9:16' as const,
    },
  };
}

function withProject(id: string, run: () => void) {
  const projectDirectory = dirname(briefPathFor(id));
  rmSync(projectDirectory, { recursive: true, force: true });
  try {
    run();
  } finally {
    rmSync(projectDirectory, { recursive: true, force: true });
  }
}

test('new projects stay at the topic Gate without an explicit human decision', () => {
  const id = `test-topic-pending-${process.pid}`;
  withProject(id, () => {
    const project = createProject(input(id));
    assert.deepEqual(project.workflow.topicApproval, {
      status: 'pending', decidedAt: '', decidedBy: '', note: '', fingerprint: '',
    });
  });
});

test('project creation binds an explicit human topic decision to the current brief', () => {
  const id = `test-topic-approved-${process.pid}`;
  withProject(id, () => {
    const project = createProject({
      ...input(id),
      topicApproval: {
        decidedBy: 'test-user',
        note: '测试人员已确认该命题值得进入素材和研究阶段。',
      },
    });
    assert.equal(project.workflow.topicApproval.status, 'approved');
    assert.equal(project.workflow.topicApproval.decidedBy, 'test-user');
    assert.equal(project.workflow.topicApproval.fingerprint, topicApprovalFingerprint(project));
  });
});
