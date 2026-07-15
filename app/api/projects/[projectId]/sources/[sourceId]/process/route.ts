import { NextResponse } from 'next/server';
import { processProjectSource } from '@/src/sourceProcessingServer';
import { readBrief } from '@/src/shortVideoProjectServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProcessSourceRouteProps {
  params: Promise<{ projectId: string; sourceId: string }>;
}

export async function POST(_request: Request, { params }: ProcessSourceRouteProps) {
  const { projectId, sourceId } = await params;
  try {
    return NextResponse.json({ project: await processProjectSource(projectId, sourceId) });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '资料处理失败',
        project: readBrief(projectId),
      },
      { status: 422 },
    );
  }
}
