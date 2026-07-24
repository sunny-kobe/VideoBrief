import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { NextResponse } from 'next/server';
import {
  briefPathFor,
  projectPaths,
  readBrief,
  readRenderManifest,
  renderStatus,
} from '@/src/shortVideoProjectServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RemotionRouteProps { params: Promise<{ projectId: string }> }

function remotionPaths(projectId: string) {
  const project = readBrief(projectId);
  const stem = basename(project.outputs.outputVideo, extname(project.outputs.outputVideo));
  const publicPath = resolve(dirname(project.outputs.publicRender), `${stem}-remotion-final.mp4`);
  return {
    project,
    publicPath,
    href: `/renders/${encodeURIComponent(`${stem}-remotion-final.mp4`)}`,
  };
}

export async function GET(_request: Request, { params }: RemotionRouteProps) {
  try {
    const { projectId } = await params;
    const paths = remotionPaths(projectId);
    return NextResponse.json({ ready: existsSync(paths.publicPath), href: paths.href });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '读取 Remotion 状态失败' }, { status: 404 });
  }
}

export async function POST(_request: Request, { params }: RemotionRouteProps) {
  try {
    const { projectId } = await params;
    const { project, publicPath, href } = remotionPaths(projectId);
    const canonicalPaths = projectPaths(project);
    if (renderStatus(readRenderManifest(canonicalPaths.manifestPath), projectId).state !== 'ready') {
      return NextResponse.json({ error: '请先完成 FFmpeg 正式成片和技术验收。' }, { status: 409 });
    }
    const result = spawnSync(process.execPath, [
      'scripts/render-remotion-project.mjs',
      `--brief=${briefPathFor(projectId)}`,
    ], { cwd: process.cwd(), encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n').trim() || 'Remotion 渲染失败');
    }
    return NextResponse.json({ ready: existsSync(publicPath), href, stdout: result.stdout });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Remotion 渲染失败' }, { status: 500 });
  }
}
