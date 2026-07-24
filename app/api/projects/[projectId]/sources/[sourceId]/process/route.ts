import { NextResponse } from 'next/server';
import {
  cancelProjectSourceProcessing,
  enqueueProjectSourceProcessing,
  projectSourceProcessingStatus,
} from '@/src/sourceProcessingQueueServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProcessSourceRouteProps {
  params: Promise<{ projectId: string; sourceId: string }>;
}

export async function POST(_request: Request, { params }: ProcessSourceRouteProps) {
  const { projectId, sourceId } = await params;
  try {
    return NextResponse.json(enqueueProjectSourceProcessing(projectId, [sourceId]), { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '资料处理失败',
      },
      { status: 400 },
    );
  }
}

export async function GET(_request: Request, { params }: ProcessSourceRouteProps) {
  const { projectId, sourceId } = await params;
  try {
    const status = projectSourceProcessingStatus(projectId);
    return NextResponse.json({
      project: status.project,
      job: [...status.jobs].reverse().find((job) => job.sourceId === sourceId) ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '读取资料处理状态失败' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, { params }: ProcessSourceRouteProps) {
  const { projectId, sourceId } = await params;
  try {
    return NextResponse.json(cancelProjectSourceProcessing(projectId, sourceId), { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取消资料处理失败' },
      { status: 409 },
    );
  }
}
