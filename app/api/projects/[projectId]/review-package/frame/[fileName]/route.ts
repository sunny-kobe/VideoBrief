import { readFileSync } from 'node:fs';
import { NextResponse } from 'next/server';

import {
  readCurrentReviewWorkPackage,
  resolveReviewFramePath,
} from '@/src/reviewWorkPackageServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ReviewFrameRouteProps {
  params: Promise<{ projectId: string; fileName: string }>;
}

export async function GET(_request: Request, { params }: ReviewFrameRouteProps) {
  try {
    const { projectId, fileName } = await params;
    const current = readCurrentReviewWorkPackage(projectId);
    const path = resolveReviewFramePath(current.workDir, current.reviewPackage, fileName);
    return new NextResponse(new Uint8Array(readFileSync(path)), {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'private, max-age=3600',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '审片帧不可用' },
      { status: 404 },
    );
  }
}
