import { NextRequest, NextResponse } from 'next/server';
import { unlink } from 'node:fs/promises';
import {
  projectSourceAssetTarget,
  readBrief,
  registerProjectSourceFile,
} from '@/src/shortVideoProjectServer';
import { ShortVideoSource } from '@/src/shortVideoBrief';
import {
  assertSourceImportCapacity,
  writeSourceStreamAtomically,
} from '@/src/sourceImportServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SourceRouteProps {
  params: Promise<{ projectId: string }>;
}

interface SourceUploadMetadata {
  fileName: string;
  fileSize: number;
  label: string;
  originUrl: string;
  mimeType: string;
  materialRole: string;
  verificationStatus: string;
  rightsStatus: string;
  rightsNote: string;
  confirmRights: string;
}

function readUploadMetadata(request: NextRequest) {
  const encoded = request.headers.get('x-videobrief-source-metadata') ?? '';
  if (!encoded || encoded.length > 32_768) throw new Error('素材上传元数据缺失或过长。');
  try {
    return JSON.parse(decodeURIComponent(encoded)) as SourceUploadMetadata;
  } catch {
    throw new Error('素材上传元数据无效。');
  }
}

async function* requestBodyChunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: NextRequest, { params }: SourceRouteProps) {
  try {
    const { projectId } = await params;
    const metadata = readUploadMetadata(request);
    if (!request.body) throw new Error('请选择本地素材文件。');
    if (metadata.confirmRights !== 'yes') throw new Error('必须先确认素材权利登记。');
    const rightsStatus = String(metadata.rightsStatus ?? 'review_required');
    if (!['cleared', 'review_required', 'blocked'].includes(rightsStatus)) {
      throw new Error('无效的素材权利状态。');
    }
    const verificationStatus = String(metadata.verificationStatus ?? 'needs_check');
    if (!['verified', 'needs_check', 'weak'].includes(verificationStatus)) {
      throw new Error('无效的来源核验状态。');
    }
    const materialRole = String(metadata.materialRole ?? 'official_demo');
    if (!['official_demo', 'broll', 'evidence', 'research'].includes(materialRole)) {
      throw new Error('无效的素材用途。');
    }
    if (!metadata.rightsNote?.trim()) throw new Error('必须填写权利与来源说明。');

    readBrief(projectId);
    const target = projectSourceAssetTarget(projectId, metadata.fileName);
    const { maxBytes } = assertSourceImportCapacity(target.assetDirectory, metadata.fileSize);
    const streamed = await writeSourceStreamAtomically({
      chunks: requestBodyChunks(request.body),
      destinationPath: target.absoluteAssetPath,
      expectedBytes: metadata.fileSize,
      maxBytes,
    });
    try {
      const result = registerProjectSourceFile(
        projectId,
        metadata.fileName,
        target.storedName,
        streamed.bytes,
        streamed.contentHash,
        {
          label: String(metadata.label ?? ''),
          originUrl: String(metadata.originUrl ?? ''),
          mimeType: String(metadata.mimeType ?? request.headers.get('content-type') ?? ''),
          materialRole: materialRole as ShortVideoSource['materialRole'],
          verificationStatus: verificationStatus as ShortVideoSource['verificationStatus'],
          rightsStatus: rightsStatus as ShortVideoSource['rightsStatus'],
          rightsNote: String(metadata.rightsNote ?? ''),
        },
      );
      return NextResponse.json({ ...result, upload: streamed }, { status: 201 });
    } catch (error) {
      await unlink(target.absoluteAssetPath).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '素材导入失败' },
      { status: 400 },
    );
  }
}
