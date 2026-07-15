import { readFileSync, statSync } from 'node:fs';
import { NextResponse } from 'next/server';
import {
  projectPaths,
  readBrief,
  readRenderManifest,
  renderStatus,
} from '@/src/shortVideoProjectServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ExportRouteProps { params: Promise<{ projectId: string }> }

export async function GET(_request: Request, { params }: ExportRouteProps) {
  try {
    const { projectId } = await params;
    const paths = projectPaths(readBrief(projectId));
    const status = renderStatus(readRenderManifest(paths.manifestPath), projectId);
    if (status.state !== 'ready') {
      return NextResponse.json({ error: `导出包不可用：${status.message}` }, { status: 409 });
    }
    const path = paths.exportZipPath;
    const bytes = readFileSync(path);
    return new NextResponse(bytes, {
      headers: {
        'content-type': 'application/zip',
        'content-length': String(statSync(path).size),
        'content-disposition': `attachment; filename="${projectId}-export.zip"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '导出包不存在' }, { status: 404 });
  }
}
