import { NextResponse } from 'next/server';
import { generateCandidateRecommendations } from '@/src/projectPlanningServer';
import { readBrief } from '@/src/shortVideoProjectServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CandidateRouteProps { params: Promise<{ projectId: string }> }

export async function POST(_request: Request, { params }: CandidateRouteProps) {
  const { projectId } = await params;
  try {
    return NextResponse.json({ project: await generateCandidateRecommendations(projectId) });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '候选画面生成失败',
      project: readBrief(projectId),
    }, { status: 422 });
  }
}
