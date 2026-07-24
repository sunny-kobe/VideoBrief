import { NextResponse } from 'next/server';
import {
  enqueueProjectSourceProcessing,
  projectSourceProcessingStatus,
} from '@/src/sourceProcessingQueueServer';
import { readBrief } from '@/src/shortVideoProjectServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProcessProjectRouteProps {
  params: Promise<{ projectId: string }>;
}

export async function POST(_request: Request, { params }: ProcessProjectRouteProps) {
  const { projectId } = await params;
  try {
    const sourceIds = readBrief(projectId).sources.map((source) => source.id);
    return NextResponse.json(enqueueProjectSourceProcessing(projectId, sourceIds), { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '资料处理入队失败' },
      { status: 400 },
    );
  }
}

export async function GET(_request: Request, { params }: ProcessProjectRouteProps) {
  const { projectId } = await params;
  try {
    return NextResponse.json(projectSourceProcessingStatus(projectId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '读取资料处理状态失败' },
      { status: 400 },
    );
  }
}
