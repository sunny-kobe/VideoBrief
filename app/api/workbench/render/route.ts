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
  readRenderManifest,
  renderStatus,
  writeBrief,
} from '@/src/shortVideoProjectServer';
import { ShortVideoProject } from '@/src/shortVideoBrief';

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

function runRender() {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn('npm', ['run', 'video:export:production'], {
      cwd: process.cwd(),
      env: process.env,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
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

export async function POST(request: NextRequest) {
  const releaseRenderLock = acquireRenderLock();
  if (!releaseRenderLock) {
    return NextResponse.json(
      { error: '已有渲染任务正在执行，请等待完成后再试。' },
      { status: 409 },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { brief?: ShortVideoProject };
    const brief = body.brief ? writeBrief(body.brief) : readBrief();
    const result = await runRender();
    const paths = projectPaths(brief);
    const manifest = readRenderManifest(paths.manifestPath);

    return NextResponse.json({
      brief,
      outputHref: paths.publicRenderHref,
      manifest,
      renderStatus: renderStatus(manifest),
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'render failed' },
      { status: 500 },
    );
  } finally {
    releaseRenderLock();
  }
}
