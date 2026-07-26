import { NextResponse } from 'next/server';

import { parseProductionWorkflowAction } from '@/src/productionWorkflow';
import {
  readProductionWorkflow,
  recordProductionWorkflowAction,
} from '@/src/productionWorkflowServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface WorkflowRouteProps {
  params: Promise<{ projectId: string }>;
}

export async function GET(_request: Request, { params }: WorkflowRouteProps) {
  try {
    const { projectId } = await params;
    return NextResponse.json(readProductionWorkflow(projectId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '读取生产流程失败' },
      { status: 404 },
    );
  }
}

export async function POST(request: Request, { params }: WorkflowRouteProps) {
  try {
    const { projectId } = await params;
    const action = parseProductionWorkflowAction(await request.json());
    return NextResponse.json(recordProductionWorkflowAction(projectId, action));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生产流程 Gate 更新失败' },
      { status: 422 },
    );
  }
}
