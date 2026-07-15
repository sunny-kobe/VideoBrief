import { NextRequest, NextResponse } from 'next/server';
import { importProjectSource } from '@/src/shortVideoProjectServer';
import { ShortVideoSource } from '@/src/shortVideoBrief';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SourceRouteProps {
  params: Promise<{ projectId: string }>;
}

export async function POST(request: NextRequest, { params }: SourceRouteProps) {
  try {
    const { projectId } = await params;
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) throw new Error('请选择本地视频文件。');
    if (file.size > 1024 * 1024 * 500) throw new Error('单个素材不能超过 500 MB。');
    if (formData.get('confirmRights') !== 'yes') throw new Error('必须先确认素材权利登记。');
    const rightsStatus = String(formData.get('rightsStatus') ?? 'review_required');
    if (!['cleared', 'review_required', 'blocked'].includes(rightsStatus)) {
      throw new Error('无效的素材权利状态。');
    }
    const verificationStatus = String(formData.get('verificationStatus') ?? 'needs_check');
    if (!['verified', 'needs_check', 'weak'].includes(verificationStatus)) {
      throw new Error('无效的来源核验状态。');
    }
    const result = importProjectSource(
      projectId,
      file.name,
      new Uint8Array(await file.arrayBuffer()),
      {
        label: String(formData.get('label') ?? ''),
        originUrl: String(formData.get('originUrl') ?? ''),
        mimeType: file.type,
        verificationStatus: verificationStatus as ShortVideoSource['verificationStatus'],
        rightsStatus: rightsStatus as ShortVideoSource['rightsStatus'],
        rightsNote: String(formData.get('rightsNote') ?? ''),
      },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '素材导入失败' },
      { status: 400 },
    );
  }
}
