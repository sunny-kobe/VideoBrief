import { NextResponse } from 'next/server';
import { readAiConfig } from '@/src/aiConfig';
import { readLocalTranscriptionConfig } from '@/src/localTranscriptionServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const config = readAiConfig();
  const transcription = readLocalTranscriptionConfig();
  return NextResponse.json({
    provider: config.provider,
    available: config.apiKeyAvailable,
    customEndpoint: Boolean(config.baseUrl),
    model: config.model,
    transcriptionProvider: transcription.provider,
    transcriptionAvailable: transcription.available,
    transcriptionCliAvailable: transcription.cliAvailable,
    transcriptionModelAvailable: transcription.modelAvailable,
    transcriptionModel: transcription.model,
    promptVersion: config.promptVersion,
  });
}
