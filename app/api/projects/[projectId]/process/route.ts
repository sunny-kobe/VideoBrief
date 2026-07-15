import { NextResponse } from 'next/server';
import { processProjectSource } from '@/src/sourceProcessingServer';
import { readBrief } from '@/src/shortVideoProjectServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProcessProjectRouteProps {
  params: Promise<{ projectId: string }>;
}

export async function POST(_request: Request, { params }: ProcessProjectRouteProps) {
  const { projectId } = await params;
  const sourceIds = readBrief(projectId).sources.map((source) => source.id);
  const failures: Array<{ sourceId: string; error: string }> = [];
  for (const sourceId of sourceIds) {
    try {
      await processProjectSource(projectId, sourceId);
    } catch (error) {
      failures.push({
        sourceId,
        error: error instanceof Error ? error.message : '资料处理失败',
      });
    }
  }
  return NextResponse.json({ project: readBrief(projectId), failures });
}
