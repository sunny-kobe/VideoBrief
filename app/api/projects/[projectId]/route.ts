import { NextResponse } from 'next/server';

import {
  ProjectDeletionConfirmationSchema,
  ProjectLifecycleActionSchema,
} from '@/src/projectLifecycle';
import {
  moveProjectToTrash,
  ProjectLifecycleError,
  updateProjectLifecycle,
} from '@/src/projectLifecycleServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProjectRouteProps {
  params: Promise<{ projectId: string }>;
}

function errorResponse(error: unknown, fallback: string) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: error instanceof ProjectLifecycleError ? error.status : 422 },
  );
}

export async function PATCH(request: Request, { params }: ProjectRouteProps) {
  try {
    const { projectId } = await params;
    const parsed = ProjectLifecycleActionSchema.safeParse(await request.json());
    if (!parsed.success) throw new ProjectLifecycleError('项目生命周期操作参数无效。', 422);
    return NextResponse.json({ project: updateProjectLifecycle(projectId, parsed.data) });
  } catch (error) {
    return errorResponse(error, '项目生命周期更新失败');
  }
}

export async function DELETE(request: Request, { params }: ProjectRouteProps) {
  try {
    const { projectId } = await params;
    const parsed = ProjectDeletionConfirmationSchema.safeParse(await request.json());
    if (!parsed.success) throw new ProjectLifecycleError('删除确认参数无效。', 422);
    return NextResponse.json({ receipt: moveProjectToTrash(projectId, parsed.data.confirmation) });
  } catch (error) {
    return errorResponse(error, '项目删除失败');
  }
}
