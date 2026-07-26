import { NextResponse } from 'next/server';

import { renderCurrentReviewWorkPackage } from '@/src/reviewWorkPackageServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ReviewPackageRouteProps {
  params: Promise<{ projectId: string }>;
}

export async function GET(_request: Request, { params }: ReviewPackageRouteProps) {
  try {
    const { projectId } = await params;
    return new NextResponse(renderCurrentReviewWorkPackage(projectId), {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'self'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '审片工作包不可用' },
      { status: 404 },
    );
  }
}
