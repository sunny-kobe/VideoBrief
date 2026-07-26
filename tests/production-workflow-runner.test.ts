import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runWorkflowUntilGate,
  type WorkflowRunnerSnapshot,
} from '../src/productionWorkflowRunner';

function snapshot(value: {
  next?: WorkflowRunnerSnapshot['workflow']['next'];
  automaticAction?: WorkflowRunnerSnapshot['workflow']['automaticAction'];
  activity?: WorkflowRunnerSnapshot['workflow']['activity'];
  failure?: WorkflowRunnerSnapshot['workflow']['failure'];
} = {}): WorkflowRunnerSnapshot {
  return {
    workflow: {
      next: value.next === undefined ? null : value.next,
      automaticAction: value.automaticAction ?? null,
      activity: value.activity ?? null,
      failure: value.failure ?? null,
    },
  };
}

test('runner stops without executing a human Gate', async () => {
  let advanceCount = 0;
  const current = snapshot({
    next: { id: 'research', label: '关键事实与风险', responsibility: 'human_gate' },
  });
  const result = await runWorkflowUntilGate({
    read: async () => current,
    advance: async () => { advanceCount += 1; return { ...current, action: null }; },
    waitForActivity: async () => {},
  });
  assert.equal(result.state, 'awaiting_human');
  assert.equal(result.next?.id, 'research');
  assert.equal(advanceCount, 0);
});

test('runner executes automatic work until the next human Gate', async () => {
  const states = [
    snapshot({
      next: { id: 'narrative', label: '叙事与脚本', responsibility: 'automatic' },
      automaticAction: 'plan_project',
    }),
    snapshot({
      next: { id: 'shots', label: '镜头语义绑定', responsibility: 'operator_review' },
    }),
  ];
  let index = 0;
  const result = await runWorkflowUntilGate({
    read: async () => states[index],
    advance: async () => ({ ...states[index], action: 'plan_project' }),
    waitForActivity: async (action) => {
      assert.equal(action, 'plan_project');
      index = 1;
    },
  });
  assert.deepEqual(result.automaticActions, ['plan_project']);
  assert.equal(result.state, 'awaiting_review');
  assert.equal(result.next?.id, 'shots');
});

test('runner waits for an existing queue task before continuing', async () => {
  const states = [
    snapshot({
      next: { id: 'technical', label: '渲染与技术验收', responsibility: 'automatic' },
      activity: { action: 'render', state: 'running', message: '正在渲染。' },
    }),
    snapshot({
      next: { id: 'acceptance', label: '成片验收', responsibility: 'human_gate' },
    }),
  ];
  let index = 0;
  const result = await runWorkflowUntilGate({
    read: async () => states[index],
    advance: async () => { throw new Error('不应重复入队'); },
    waitForActivity: async () => { index = 1; },
  });
  assert.deepEqual(result.automaticActions, []);
  assert.equal(result.next?.id, 'acceptance');
});

test('runner surfaces queue failures instead of silently retrying', async () => {
  const current = snapshot({
    next: { id: 'technical', label: '渲染与技术验收', responsibility: 'automatic' },
    automaticAction: 'render',
    failure: { action: 'render', message: 'FFmpeg exited with 1', failedAt: 'now' },
  });
  await assert.rejects(runWorkflowUntilGate({
    read: async () => current,
    advance: async () => ({ ...current, action: 'render' }),
    waitForActivity: async () => {},
  }), /render 失败：FFmpeg exited with 1/);
});
