import { NextResponse } from 'next/server';
import { applyNarrativeDraft } from '@/src/projectPlanningServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ApplyNarrativeRouteProps { params: Promise<{ projectId: string }> }

export async function POST(request: Request, { params }: ApplyNarrativeRouteProps) {
  try {
    const { projectId } = await params;
    const body = (await request.json().catch(() => ({}))) as { confirmReplace?: boolean };
    return NextResponse.json({ project: applyNarrativeDraft(projectId, body.confirmReplace === true) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '应用草案失败' }, { status: 400 });
  }
}
