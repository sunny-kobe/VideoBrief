import { NextResponse } from 'next/server';
import { produceProjectAutomatically } from '@/src/projectPlanningServer';
import { processProjectSource } from '@/src/sourceProcessingServer';
import { readBrief } from '@/src/shortVideoProjectServer';

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
    const initialProject = readBrief(projectId);
    if (!initialProject.sources.length) throw new Error('请先导入至少一份素材。');

    const failures: string[] = [];
    for (const source of initialProject.sources) {
      if (source.processing.status === 'completed') continue;
      try {
        await processProjectSource(projectId, source.id);
      } catch (error) {
        failures.push(`${source.label}: ${error instanceof Error ? error.message : '素材解析失败'}`);
      }
    }
    if (failures.length) throw new Error(failures.join('；'));

    const project = await produceProjectAutomatically(projectId, instruction);
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '自动制作失败',
      project: readBrief(projectId),
    }, { status: 422 });
  }
}
