import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { DELETE, PATCH } from '../app/api/projects/[projectId]/route';
import { GET as GET_DELETION_PLAN } from '../app/api/projects/[projectId]/deletion-plan/route';
import { enqueueRenderQueueJob } from '../src/renderQueue';
import { normalizeBrief } from '../src/shortVideoProjectServer';

const props = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

test('lifecycle APIs reject non-strict or mismatched inputs', async () => {
  const patchResponse = await PATCH(new Request('http://local/api/projects/test', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'archive', archivedBy: 'user', archiveReason: '', unexpected: true }),
  }), props('test-project'));
  assert.equal(patchResponse.status, 422);

  const deleteResponse = await DELETE(new Request('http://local/api/projects/test', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirmation: 'wrong-project' }),
  }), props('test-project'));
  assert.equal(deleteResponse.status, 422);

  const planResponse = await GET_DELETION_PLAN(new Request('http://local'), props('../escape'));
  assert.equal(planResponse.status, 400);
});

test('DELETE returns 409 while a project has an active queue record', async () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-api-delete-'));
  const previousRoot = process.env.VIDEOBRIEF_STORAGE_ROOT;
  process.env.VIDEOBRIEF_STORAGE_ROOT = root;
  try {
    const projectId = 'api-delete-fixture';
    const project = normalizeBrief({ id: projectId, title: 'API 删除 fixture' });
    const projectDir = join(root, 'content/projects', projectId);
    const projectPath = join(projectDir, 'project.json');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`);
    enqueueRenderQueueJob(join(root, 'output/render-queue/queue.json'), { projectId, briefPath: projectPath });

    const response = await DELETE(new Request('http://local', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: projectId }),
    }), props(projectId));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /queued\/running\/cancelling/);
  } finally {
    if (previousRoot == null) delete process.env.VIDEOBRIEF_STORAGE_ROOT;
    else process.env.VIDEOBRIEF_STORAGE_ROOT = previousRoot;
    rmSync(root, { recursive: true, force: true });
  }
});
