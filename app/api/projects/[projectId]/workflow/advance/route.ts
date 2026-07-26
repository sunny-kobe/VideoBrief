import { NextResponse } from 'next/server';

import { advanceProductionWorkflow } from '@/src/productionWorkflowServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface WorkflowAdvanceRouteProps {
  params: Promise<{ projectId: string }>;
}

export async function POST(request: Request, { params }: WorkflowAdvanceRouteProps) {
  try {
    const { projectId } = await params;
    const body = await request.json().catch(() => ({})) as { instruction?: string };
    const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 2000) : '';
    return NextResponse.json(advanceProductionWorkflow(projectId, instruction), { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '自动推进生产流程失败' },
      { status: 422 },
    );
  }
}
