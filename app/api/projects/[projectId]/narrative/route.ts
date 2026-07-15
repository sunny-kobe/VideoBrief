import { NextResponse } from 'next/server';
import { discardNarrativeDraft, generateNarrativeDraft } from '@/src/projectPlanningServer';
import { readBrief } from '@/src/shortVideoProjectServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface NarrativeRouteProps { params: Promise<{ projectId: string }> }

export async function POST(_request: Request, { params }: NarrativeRouteProps) {
  const { projectId } = await params;
  try {
    return NextResponse.json({ project: await generateNarrativeDraft(projectId) });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'AI 叙事生成失败',
      project: readBrief(projectId),
    }, { status: 422 });
  }
}

export async function DELETE(_request: Request, { params }: NarrativeRouteProps) {
  const { projectId } = await params;
  try {
    return NextResponse.json({ project: discardNarrativeDraft(projectId) });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '丢弃叙事草案失败',
      project: readBrief(projectId),
    }, { status: 422 });
  }
}
