import { NextRequest, NextResponse } from 'next/server';
import { generateVoicePreview, readVoicePreview } from '@/src/voicePreviewServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { projectId?: string; sceneId?: string; text?: string };
    if (!body.projectId || !body.sceneId || typeof body.text !== 'string') {
      return NextResponse.json({ error: 'projectId、sceneId 和试听文案不能为空。' }, { status: 400 });
    }
    return NextResponse.json(await generateVoicePreview(body.projectId, body.sceneId, body.text));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '旁白试听生成失败' },
      { status: 400 },
    );
  }
}

export function GET(request: NextRequest) {
  const audio = readVoicePreview(request.nextUrl.searchParams.get('key') ?? '');
  if (!audio) return NextResponse.json({ error: 'voice preview not found' }, { status: 404 });
  return new NextResponse(new Uint8Array(audio.buffer), {
    headers: {
      'content-type': audio.mimeType,
      'cache-control': 'private, max-age=31536000, immutable',
    },
  });
}
