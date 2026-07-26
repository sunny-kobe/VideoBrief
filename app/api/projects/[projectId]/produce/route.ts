import { NextResponse } from 'next/server';
import {
  cancelProjectPlanning,
  enqueueProjectPlanning,
  projectPlanningStatus,
} from '@/src/projectPlanningQueueServer';
import { prepareProjectSourcesForAutomaticProduction } from '@/src/sourceProcessingQueueServer';
import { readBrief } from '@/src/shortVideoProjectServer';
import {
  approvalIsCurrent,
  materialGateReadiness,
  preproductionGateReadiness,
  topicApprovalFingerprint,
} from '@/scripts/lib/production-workflow-contract.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProduceRouteProps {
  params: Promise<{ projectId: string }>;
}

export async function POST(request: Request, { params }: ProduceRouteProps) {
  const { projectId } = await params;
  try {
    const body = await request.json().catch(() => ({})) as { instruction?: string };
    const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 2000) : '';
    const project = readBrief(projectId);
    if (!approvalIsCurrent(project.workflow.topicApproval, topicApprovalFingerprint(project))) {
      throw new Error('最终命题尚未通过当前版本的人工 Gate。');
    }
    const material = materialGateReadiness(project);
    if (!material.ready) throw new Error(material.issues.join('；'));
    const preparation = prepareProjectSourcesForAutomaticProduction(projectId);
    if (preparation.state === 'processing_sources') {
      return NextResponse.json(preparation, { status: 202 });
    }

    const current = readBrief(projectId);
    const gates = preproductionGateReadiness(current);
    if (!gates.ready) {
      return NextResponse.json({
        state: 'awaiting_research',
        project: current,
        issues: gates.issues,
      });
    }
    const planning = enqueueProjectPlanning(projectId, instruction);
    return NextResponse.json(planning, { status: 202 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '自动制作失败',
      project: readBrief(projectId),
    }, { status: 422 });
  }
}

export async function GET(_request: Request, { params }: ProduceRouteProps) {
  const { projectId } = await params;
  try {
    return NextResponse.json(projectPlanningStatus(projectId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '读取策划任务失败' }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: ProduceRouteProps) {
  const { projectId } = await params;
  try {
    return NextResponse.json(cancelProjectPlanning(projectId), { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '取消策划任务失败' }, { status: 409 });
  }
}
