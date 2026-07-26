import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSceneInformationLayerPlan,
  sceneInformationVisualKind,
} from '../scripts/lib/scene-information-layer.mjs';

test('builds a unique immutable source window for every enabled scene', () => {
  const plan = buildSceneInformationLayerPlan({
    scenes: [
      { id: 'scene-01', enabled: true, title: '从 Brief 开始' },
      { id: 'scene-02', enabled: false, title: 'disabled' },
      { id: 'scene-03', enabled: true, title: '验证 proof' },
    ],
  }, 20);
  assert.deepEqual(plan.map((item) => [item.sceneId, item.sourceStart, item.sourceEnd]), [
    ['scene-01', 0, 20],
    ['scene-03', 20, 40],
  ]);
  assert.notEqual(plan[0].matchReason, plan[1].matchReason);
  assert.ok(plan.every((item) => item.rightsStatus === 'cleared'));
  assert.ok(plan.every((item) => item.showEditorialOverlay === false));
});

test('uses the creative brief duration when no explicit segment size is supplied', () => {
  const plan = buildSceneInformationLayerPlan({
    brief: { targetDurationSeconds: 18 },
    scenes: [
      { id: 'scene-01', enabled: true, title: 'one' },
      { id: 'scene-02', enabled: true, title: 'two' },
    ],
  });
  assert.deepEqual(plan.map((item) => [item.sourceStart, item.sourceEnd]), [[0, 9], [9, 18]]);
});

test('routes common production scenes to a matching information structure', () => {
  assert.equal(sceneInformationVisualKind({ title: 'Creative Brief' }), 'brief');
  assert.equal(sceneInformationVisualKind({ title: '来源与权利' }), 'evidence');
  assert.equal(sceneInformationVisualKind({ title: '确认后再合成' }), 'approval');
  assert.equal(sceneInformationVisualKind({ title: 'proof 验收' }), 'proof');
  assert.equal(sceneInformationVisualKind({ title: '发布与市场状态' }), 'statuses');
  assert.equal(sceneInformationVisualKind({
    title: '把最后决定留给人',
    visualRequirement: '停在 draft-unpublished 和 market_status: none，并提示人工确认',
  }), 'statuses');
});
