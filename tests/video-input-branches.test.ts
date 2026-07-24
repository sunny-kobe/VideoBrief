import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import ffmpegPath from 'ffmpeg-static';
import { planVideoInputBranches } from '../scripts/lib/video-input-branches.mjs';

test('gives every scene an independent branch when one source is reused', () => {
  const result = planVideoInputBranches([
    { sourceId: 'source-a' },
    { sourceId: 'source-a' },
    { sourceId: 'source-b' },
    { sourceId: 'source-a' },
  ], new Map([['source-a', 0], ['source-b', 1]]));

  assert.deepEqual(result.filters, [
    '[0:v]split=3[source0_0_raw][source0_1_raw][source0_2_raw]',
    '[source0_0_raw]fifo[source0_0]',
    '[source0_1_raw]fifo[source0_1]',
    '[source0_2_raw]fifo[source0_2]',
    '[1:v]null[source1_0]',
  ]);
  assert.deepEqual(result.sceneInputLabels, [
    'source0_0',
    'source0_1',
    'source1_0',
    'source0_2',
  ]);
  assert.equal(new Set(result.sceneInputLabels).size, 4);
});

test('keeps non-monotonic windows on the expected concat timeline', () => {
  assert.ok(ffmpegPath);
  const directory = mkdtempSync(join(tmpdir(), 'videobrief-input-branches-'));
  const sourcePath = join(directory, 'source.mp4');
  const outputPath = join(directory, 'output.mp4');

  try {
    const source = spawnSync(ffmpegPath, [
      '-y',
      '-f', 'lavfi',
      '-i', 'testsrc2=duration=8:size=96x54:rate=10',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      sourcePath,
    ], { encoding: 'utf8' });
    assert.equal(source.status, 0, source.stderr);

    const scenes = [
      { sourceId: 'source-a', sourceStart: 5, duration: 1 },
      { sourceId: 'source-a', sourceStart: 1, duration: 1 },
      { sourceId: 'source-a', sourceStart: 7, duration: 1 },
    ];
    const plan = planVideoInputBranches(scenes, new Map([['source-a', 0]]));
    const trims = scenes.map((scene, index) => (
      `[${plan.sceneInputLabels[index]}]trim=start=${scene.sourceStart}:duration=${scene.duration},`
      + `setpts=PTS-STARTPTS,fps=10[v${index}]`
    ));
    const concatInputs = scenes.map((_, index) => `[v${index}]`).join('');
    const filterComplex = [
      ...plan.filters,
      ...trims,
      `${concatInputs}concat=n=${scenes.length}:v=1:a=0[vout]`,
    ].join(';');
    const render = spawnSync(ffmpegPath, [
      '-y',
      '-i', sourcePath,
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      '-an',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      outputPath,
    ], { encoding: 'utf8' });
    assert.equal(render.status, 0, render.stderr);
    assert.doesNotMatch(render.stderr, /buffers queued/i);

    const probe = spawnSync(ffmpegPath, ['-hide_banner', '-i', outputPath], { encoding: 'utf8' });
    const duration = probe.stderr.match(/Duration:\s*00:00:(\d+(?:\.\d+)?)/)?.[1];
    assert.ok(duration, probe.stderr);
    assert.ok(Math.abs(Number(duration) - 3) <= 0.1, `Expected 3s output, received ${duration}s.`);
    assert.ok(readFileSync(outputPath).length > 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
