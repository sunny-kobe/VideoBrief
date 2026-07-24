import { NextResponse } from 'next/server';
import { listDailySignalRuns, readLatestDailySignalRun, scanDailySignals } from '@/src/dailySignalServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ latest: readLatestDailySignalRun(), runs: listDailySignalRuns().slice(0, 14) });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { replace?: boolean };
    const run = await scanDailySignals({ replace: body.replace === true });
    return NextResponse.json({ run }, { status: run.status === 'completed' ? 201 : 422 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '每日信号扫描失败' }, { status: 500 });
  }
}

