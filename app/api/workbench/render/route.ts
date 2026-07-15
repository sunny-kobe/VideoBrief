import { spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import {
  projectPaths,
  readBrief,
  readRenderJob,
  readRenderManifest,
  renderStatus,
  recordRenderAttempt,
  recordRenderFailure,
  writeRenderJob,
  writeBrief,
} from '@/src/shortVideoProjectServer';
import { RenderJobRecord, ShortVideoProject } from '@/src/shortVideoBrief';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const renderLockPath = resolve('output/videos/.videobrief-render.lock');

function acquireRenderLock() {
  mkdirSync(dirname(renderLockPath), { recursive: true });
  if (
    existsSync(renderLockPath) &&
    Date.now() - statSync(renderLockPath).mtimeMs > 30 * 60 * 1000
  ) {
    unlinkSync(renderLockPath);
  }

  try {
    const descriptor = openSync(renderLockPath, 'wx');
    writeFileSync(descriptor, `${process.pid}\n${new Date().toISOString()}\n`);
    closeSync(descriptor);
    return () => {
      if (existsSync(renderLockPath)) unlinkSync(renderLockPath);
    };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') return null;
    throw error;
  }
}

function runRender(briefPath: string, onStage: (stage: RenderJobRecord['stage']) => void) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/export-production.mjs', `--brief=${briefPath}`], {
      cwd: process.cwd(),
      env: process.env,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (text.includes('[videobrief-stage] rendering')) onStage('rendering');
      if (text.includes('[videobrief-stage] proof')) onStage('proof');
      if (text.includes('[videobrief-stage] packaging')) onStage('packaging');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`render exited with ${code}\n${stdout}\n${stderr}`));
      }
    });
  });
}

function failedRenderMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'render failed';
  return message.split('\n').map((line) => line.trim()).filter(Boolean).slice(-12).join('\n');
}

export function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) throw new Error('projectId is required');
    const project = readBrief(projectId);
    const paths = projectPaths(project);
    const manifest = readRenderManifest(paths.manifestPath);
    return NextResponse.json({
      job: readRenderJob(paths.renderJobPath),
      renderStatus: renderStatus(manifest, projectId),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'render status failed' },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  const releaseRenderLock = acquireRenderLock();
  if (!releaseRenderLock) {
    return NextResponse.json(
      { error: '已有渲染任务正在执行，请等待完成后再试。' },
      { status: 409 },
    );
  }

  let renderJobPath = '';
  let job: RenderJobRecord | null = null;
  let activeProjectId = '';
  let renderAttemptRecorded = false;
  try {
    const body = (await request.json().catch(() => ({}))) as { projectId?: string; brief?: ShortVideoProject };
    const projectId = body.projectId ?? body.brief?.id;
    if (!projectId) throw new Error('projectId is required');
    activeProjectId = projectId;
    if (body.brief) writeBrief(projectId, body.brief);
    const brief = recordRenderAttempt(projectId);
    renderAttemptRecorded = true;
    const paths = projectPaths(brief);
    renderJobPath = paths.renderJobPath;
    const startedAt = new Date().toISOString();
    job = writeRenderJob(renderJobPath, {
      schemaVersion: 1,
      projectId,
      state: 'running',
      stage: 'saving',
      startedAt,
      updatedAt: startedAt,
      completedAt: '',
      error: '',
    });
    const result = await runRender(paths.briefPath, (stage) => {
      if (!job) return;
      job = writeRenderJob(renderJobPath, {
        ...job,
        stage,
        updatedAt: new Date().toISOString(),
      });
    });
    const renderedBrief = readBrief(projectId);
    const manifest = readRenderManifest(paths.manifestPath);
    const completedAt = new Date().toISOString();
    job = writeRenderJob(renderJobPath, {
      ...job,
      state: 'completed',
      stage: 'completed',
      updatedAt: completedAt,
      completedAt,
      error: '',
    });

    return NextResponse.json({
      brief: renderedBrief,
      outputHref: paths.publicRenderHref,
      manifest,
      renderStatus: renderStatus(manifest, projectId),
      renderJob: job,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (error) {
    const message = failedRenderMessage(error);
    if (job && renderJobPath) {
      const completedAt = new Date().toISOString();
      writeRenderJob(renderJobPath, {
        ...job,
        state: 'failed',
        updatedAt: completedAt,
        completedAt,
        error: message,
      });
    }
    if (activeProjectId && renderAttemptRecorded) {
      try {
        recordRenderFailure(activeProjectId, message);
      } catch (recordError) {
        console.error(
          'Failed to persist render failure:',
          recordError instanceof Error ? recordError.message : recordError,
        );
      }
    }
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  } finally {
    releaseRenderLock();
  }
}
