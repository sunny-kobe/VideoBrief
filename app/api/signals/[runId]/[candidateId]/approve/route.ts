import { NextResponse } from 'next/server';
import { approveDailySignal } from '@/src/dailySignalServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ApproveRouteProps {
  params: Promise<{ runId: string; candidateId: string }>;
}

export async function POST(request: Request, { params }: ApproveRouteProps) {
  try {
    const { runId, candidateId } = await params;
    const body = await request.json().catch(() => ({})) as { decidedBy?: string; note?: string };
    const result = await approveDailySignal(runId, candidateId, {
      decidedBy: body.decidedBy ?? '',
      note: body.note ?? '',
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '批准候选失败' }, { status: 422 });
  }
}
