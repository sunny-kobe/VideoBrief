import assert from 'node:assert/strict';
import test from 'node:test';

import { wrapText } from '../scripts/lib/text-wrapping.mjs';

test('does not split an English technical term across subtitle lines', () => {
  const lines = wrapText('官方还写了会话恢复和独立 worktree；', 16);

  assert.deepEqual(lines, ['官方还写了会话恢复和独立', 'worktree；']);
  assert.equal(lines.join(''), '官方还写了会话恢复和独立worktree；');
});

test('preserves mixed-case product names and numeric tokens', () => {
  const lines = wrapText('环境要求是 macOS 14+，DMG 为临时签名。', 12);

  assert.ok(lines.some((line) => line.includes('macOS')));
  assert.ok(lines.some((line) => line.includes('14+')));
  assert.ok(lines.some((line) => line.includes('DMG')));
  assert.ok(lines.every((line) => !['mac', 'OS', 'D', 'MG'].includes(line)));
});

test('still wraps an indivisible token that is wider than the line', () => {
  const lines = wrapText('averyverylongtechnicalidentifier', 4);

  assert.ok(lines.length > 1);
  assert.equal(lines.join(''), 'averyverylongtechnicalidentifier');
});
