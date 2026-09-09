import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { distribution, efficiencySample, summarizeEfficiencySamples } from '../scripts/lib/production-efficiency.mjs';

test('historical distributions exclude missing and invalid measurements without excluding zero', () => {
  assert.deepEqual(distribution([null, undefined, -1, NaN, 0, 10, 20, 30]), {
    measured: 4, missing: 4, median: 15, p90: 30,
  });
  assert.equal(distribution([null]).median, null);
});

test('cache groups and normalized render time distinguish cold, partial and warm records', () => {
  const sample = (hits: number, width = 1920) => efficiencySample({ id: 'a' }, {
    render: { width, height: 1080, fps: 30, duration: 60 },
    productionMetrics: {
      elapsed: { stages: { render: { wallMs: 12000 } } },
      renderCache: { sceneSegments: 2, sceneSegmentCacheHits: hits, sceneSegmentCacheMisses: 2 - hits },
    },
  });
  assert.equal(sample(0).cacheMode, 'cold');
  assert.equal(sample(1).cacheMode, 'partial');
  assert.equal(sample(2).cacheMode, 'warm');
  assert.equal(sample(3).cacheMode, 'unknown');
  assert.equal(sample(0).renderSecondsPerVideoSecond, 0.2);
  assert.equal(summarizeEfficiencySamples([sample(0), sample(0), sample(1), sample(2), sample(2, 1080)]).length, 4);
  const missing = efficiencySample({ id: 'a' }, {});
  assert.equal(missing.renderMs, null);
  assert.equal(missing.renderSecondsPerVideoSecond, null);
});

test('baseline CLI reads one canonical manifest and reports malformed or mismatched projects as gaps', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-efficiency-'));
  try {
    const projects = join(root, 'projects');
    mkdirSync(projects);
    for (const id of ['good', 'mismatch', 'missing', 'broken']) {
      const dir = join(projects, id);
      const work = join(root, id);
      mkdirSync(dir); mkdirSync(work);
      writeFileSync(join(dir, 'project.json'), id === 'broken' ? '{' : JSON.stringify({ id, outputs: { workDir: work } }));
      if (id !== 'missing') writeFileSync(join(work, 'render-manifest.json'), JSON.stringify({
        projectId: id === 'mismatch' ? 'another' : id,
        render: { duration: 30 },
        productionMetrics: { elapsed: { stages: { render: { wallMs: 5000 } } } },
      }));
    }
    const output = JSON.parse(execFileSync(process.execPath, [resolve('scripts/report-production-baseline.mjs'), `--projects=${projects}`], { encoding: 'utf8' }));
    assert.equal(output.sampleCount, 1);
    assert.equal(output.samples[0].renderMs, 5000);
    assert.deepEqual(output.excluded.map((row: { reason: string }) => row.reason).sort(), [
      'manifest_project_mismatch', 'no_manifest', 'unreadable_project_or_manifest',
    ]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
