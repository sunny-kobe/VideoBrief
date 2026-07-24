import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCliArgs } from '../scripts/lib/cli-args.mjs';

test('keeps adjacent boolean flags independent', () => {
  const { args } = parseCliArgs(['--start-session', '--restart-session', '--reviewer=codex']);
  assert.equal(args.get('start-session'), true);
  assert.equal(args.get('restart-session'), true);
  assert.equal(args.get('reviewer'), 'codex');
});

test('parses spaced values without consuming positional arguments', () => {
  const { args, positional } = parseCliArgs(['--manifest', 'render.json', 'project-id']);
  assert.equal(args.get('manifest'), 'render.json');
  assert.deepEqual(positional, ['project-id']);
});
