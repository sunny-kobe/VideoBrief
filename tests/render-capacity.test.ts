import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_RENDER_DISK_RESERVE_BYTES,
  estimateRenderWorkspaceBytes,
  validateRenderCapacity,
} from '../scripts/lib/render-capacity.mjs';

test('longer and denser renders reserve more workspace', () => {
  const short = estimateRenderWorkspaceBytes({
    durationSeconds: 60, width: 1920, height: 1080, fps: 30, sceneCount: 7,
  });
  const long = estimateRenderWorkspaceBytes({
    durationSeconds: 600, width: 1920, height: 1080, fps: 30, sceneCount: 40,
  });
  assert.ok(long.estimatedBytes > short.estimatedBytes * 4);
  assert.ok(long.encodedCopies >= 5);
  assert.ok(long.estimatedBytes > 2 * 1024 ** 3);
});

test('render capacity requires the reserve to remain after estimated peak usage', () => {
  const estimatedBytes = 5 * 1024 ** 3;
  assert.equal(validateRenderCapacity({
    freeBytes: estimatedBytes + DEFAULT_RENDER_DISK_RESERVE_BYTES,
    estimatedBytes,
    reserveBytes: DEFAULT_RENDER_DISK_RESERVE_BYTES,
  }).passed, true);
  const blocked = validateRenderCapacity({
    freeBytes: estimatedBytes + DEFAULT_RENDER_DISK_RESERVE_BYTES - 1,
    estimatedBytes,
    reserveBytes: DEFAULT_RENDER_DISK_RESERVE_BYTES,
  });
  assert.equal(blocked.passed, false);
  assert.match(blocked.issues[0], /渲染磁盘空间不足/);
});
