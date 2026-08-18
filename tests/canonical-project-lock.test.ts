import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

import {
  briefPathFor,
  createProject,
  readBrief,
  registerProjectSourceFile,
  updateCanonicalProject,
  writeBrief,
} from '../src/shortVideoProjectServer';

function runUpdate(projectId: string, field: string, value: string) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [
      '--import',
      'tsx',
      resolve('tests/fixtures/update-canonical-project.ts'),
      `--project=${projectId}`,
      `--field=${field}`,
      `--value=${value}`,
      '--delay=250',
    ], {
      cwd: process.cwd(),
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(stderr || `canonical update exited with ${code ?? signal}`));
    });
  });
}

test('canonical project updates serialize read-modify-write across processes', async () => {
  const projectId = `test-canonical-lock-${process.pid}-${randomUUID()}`;
  const projectDirectory = dirname(briefPathFor(projectId));
  rmSync(projectDirectory, { recursive: true, force: true });
  try {
    createProject({
      id: projectId,
      title: 'Canonical lock test',
      brief: {
        objective: '验证并发写入不会丢失',
        audience: '测试人员',
        coreMessage: '项目更新必须串行归并',
      },
    });
    await Promise.all([
      runUpdate(projectId, 'whyItMatters', 'first concurrent update'),
      runUpdate(projectId, 'chinaContext', 'second concurrent update'),
    ]);

    const project = readBrief(projectId);
    assert.equal(project.editorial.whyItMatters, 'first concurrent update');
    assert.equal(project.editorial.chinaContext, 'second concurrent update');
  } finally {
    rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('a stale workbench save does not overwrite newer source processing results', () => {
  const projectId = `test-canonical-save-${process.pid}-${randomUUID()}`;
  const projectDirectory = dirname(briefPathFor(projectId));
  rmSync(projectDirectory, { recursive: true, force: true });
  try {
    createProject({
      id: projectId,
      title: 'Stale save test',
      brief: {
        objective: '验证旧页面快照不会覆盖处理结果',
        audience: '测试人员',
        coreMessage: '来源处理结果必须保留',
      },
    });
    registerProjectSourceFile(
      projectId,
      'source.txt',
      'source.txt',
      10,
      'a'.repeat(64),
      {
        label: '测试来源',
        mimeType: 'text/plain',
        verificationStatus: 'verified',
        rightsStatus: 'cleared',
        rightsNote: '测试自产文本',
      },
    );
    const stale = readBrief(projectId);
    updateCanonicalProject(projectId, (project) => ({
      ...project,
      sources: project.sources.map((source) => ({
        ...source,
        processing: {
          ...source.processing,
          status: 'completed',
          stage: 'completed',
          attempts: 1,
          startedAt: '2026-08-17T00:00:00.000Z',
          completedAt: '2026-08-17T00:00:01.000Z',
        },
        analysis: {
          ...source.analysis,
          extractedText: 'new processing result',
        },
      })),
    }));

    const saved = writeBrief(projectId, stale, { incrementManualSave: true });
    assert.equal(saved.sources[0].processing.status, 'completed');
    assert.equal(saved.sources[0].analysis.extractedText, 'new processing result');
    assert.equal(saved.production.manualSaveCount, 1);
  } finally {
    rmSync(projectDirectory, { recursive: true, force: true });
  }
});
