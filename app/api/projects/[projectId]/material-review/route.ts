import { NextResponse } from 'next/server';
import { approveProjectMaterials, readBrief } from '@/src/shortVideoProjectServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MaterialReviewRouteProps { params: Promise<{ projectId: string }> }

export async function POST(request: Request, { params }: MaterialReviewRouteProps) {
  const { projectId } = await params;
  try {
    const body = await request.json() as { sourceIds?: unknown };
    const sourceIds = Array.isArray(body.sourceIds)
      ? body.sourceIds.filter((value): value is string => typeof value === 'string')
      : [];
    return NextResponse.json({ project: approveProjectMaterials(projectId, sourceIds) });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '素材包确认失败',
      project: readBrief(projectId),
    }, { status: 422 });
  }
}
