import { NextResponse } from 'next/server';
import { generateProductionAssetDraft } from '@/src/projectPlanningServer';
import { readBrief } from '@/src/shortVideoProjectServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProductionAssetsRouteProps { params: Promise<{ projectId: string }> }

export async function POST(_request: Request, { params }: ProductionAssetsRouteProps) {
  const { projectId } = await params;
  try {
    return NextResponse.json({ project: await generateProductionAssetDraft(projectId) });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '发布资产草稿生成失败',
      project: readBrief(projectId),
    }, { status: 422 });
  }
}
