import { NextResponse } from 'next/server';

import {
  checkProgrammaticPublisherAccount,
  executeProgrammaticPublication,
  loginProgrammaticPublisherAccount,
  prepareProgrammaticPublication,
} from '@/src/programmaticPublisher';
import { readBrief } from '@/src/shortVideoProjectServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PublicationRouteProps {
  params: Promise<{ projectId: string }>;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request, { params }: PublicationRouteProps) {
  try {
    const { projectId } = await params;
    const body = await request.json() as Record<string, unknown>;
    const action = stringValue(body.action);
    const accountName = stringValue(body.accountName) || 'daily-cause';
    const project = readBrief(projectId);
    const targetId = stringValue(body.targetId);
    const target = (project.workflow.publicationTargets ?? []).find((item) => item.id === targetId);
    const platform = stringValue(body.platform) || target?.platform || target?.id || '';
    if (!platform) throw new Error('必须指定发布平台或已批准的平台目标。');

    if (action === 'check') {
      const result = await checkProgrammaticPublisherAccount(platform, accountName);
      return NextResponse.json({ ...result, state: result.valid ? '登录有效' : '需要程序登录' });
    }
    if (action === 'login') {
      const result = await loginProgrammaticPublisherAccount(platform, accountName);
      return NextResponse.json({ ...result, state: '登录有效' });
    }
    if (action !== 'publish') throw new Error('不支持的程序化发布操作。');
    if (!target) throw new Error('程序化上传前必须先批准具体的平台目标。');

    const plan = prepareProgrammaticPublication({
      projectId,
      targetId,
      accountName,
      schedule: stringValue(body.schedule),
      bilibiliCategoryId: Number(body.bilibiliCategoryId ?? process.env.VIDEOBRIEF_BILIBILI_TID ?? 201),
      headed: body.headed === true,
    });
    const result = await executeProgrammaticPublication(plan);
    return NextResponse.json({ result, state: plan.scheduledAt ? '程序已提交排期' : '程序已提交上传' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '程序化发布失败' },
      { status: 422 },
    );
  }
}
