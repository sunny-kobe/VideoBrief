import { NextResponse } from 'next/server';

import {
  buildProjectDeletionPlan,
  ProjectLifecycleError,
} from '@/src/projectLifecycleServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DeletionPlanRouteProps {
  params: Promise<{ projectId: string }>;
}

export async function GET(_request: Request, { params }: DeletionPlanRouteProps) {
  try {
    const { projectId } = await params;
    return NextResponse.json({ plan: buildProjectDeletionPlan(projectId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除计划生成失败' },
      { status: error instanceof ProjectLifecycleError ? error.status : 400 },
    );
  }
}
