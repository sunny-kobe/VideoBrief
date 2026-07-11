import { NextRequest, NextResponse } from 'next/server';
import { readBrief, writeBrief } from '@/src/shortVideoProjectServer';
import { ShortVideoProject } from '@/src/shortVideoBrief';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ brief: readBrief() });
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { brief?: ShortVideoProject };
    if (!body.brief) {
      return NextResponse.json({ error: 'project is required' }, { status: 400 });
    }

    return NextResponse.json({ brief: writeBrief(body.brief) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'project save failed' },
      { status: 400 },
    );
  }
}
