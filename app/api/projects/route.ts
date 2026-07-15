import { NextRequest, NextResponse } from 'next/server';
import { createProject, listProjects } from '@/src/shortVideoProjectServer';
import { CreateProjectInput } from '@/src/shortVideoProjectServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ projects: listProjects() });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateProjectInput;
    return NextResponse.json({ project: createProject(body) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '项目创建失败' },
      { status: 400 },
    );
  }
}
