import { NextRequest, NextResponse } from 'next/server';
import { readBrief, writeBrief } from '@/src/shortVideoProjectServer';
import { ShortVideoProject } from '@/src/shortVideoBrief';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('project') ?? undefined;
  return NextResponse.json({ brief: readBrief(projectId) });
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { projectId?: string; brief?: ShortVideoProject };
    if (!body.brief) {
      return NextResponse.json({ error: 'project is required' }, { status: 400 });
    }
    const projectId = body.projectId ?? body.brief.id;

    return NextResponse.json({
      brief: writeBrief(projectId, body.brief, { incrementManualSave: true }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'project save failed' },
      { status: 400 },
    );
  }
}
