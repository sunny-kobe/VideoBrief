import { readFileSync, statSync } from 'node:fs';
import { NextResponse } from 'next/server';
import {
  projectPaths,
  projectPackageContentFingerprint,
  projectProductionContentFingerprint,
  readBrief,
  readRenderManifest,
  renderStatus,
} from '@/src/shortVideoProjectServer';
import {
  exportPackageReadiness,
  readExportPackageReceipt,
} from '@/src/exportPackage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ExportRouteProps { params: Promise<{ projectId: string }> }

export async function GET(_request: Request, { params }: ExportRouteProps) {
  try {
    const { projectId } = await params;
    const project = readBrief(projectId);
    const paths = projectPaths(project);
    const manifest = readRenderManifest(paths.manifestPath);
    const status = renderStatus(manifest, projectId);
    if (status.state !== 'ready') {
      return NextResponse.json({ error: `导出包不可用：${status.message}` }, { status: 409 });
    }
    const packageStatus = exportPackageReadiness({
      projectId,
      projectFingerprint: manifest!.projectFingerprint,
      productionContentFingerprint: projectProductionContentFingerprint(projectId),
      packageContentFingerprint: projectPackageContentFingerprint(projectId),
      renderedAt: manifest!.renderedAt,
      renderManifestPath: paths.manifestPath,
      videoPath: paths.publicRenderPath,
      zipPath: paths.exportZipPath,
      deliveryApproval: project.workflow.deliveryApproval,
      receipt: readExportPackageReceipt(paths.exportPackageReceiptPath),
    });
    if (!packageStatus.ready) {
      return NextResponse.json({ error: `导出包不可用：${packageStatus.reason}` }, { status: 409 });
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
