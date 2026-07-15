export const OPENAI_DEFAULT_MODEL = 'gpt-5.6';
export const DEFAULT_TRANSCRIPTION_MODEL = 'whisper.cpp:large-v3-turbo-q5_0';
export const AI_PROMPT_VERSION = 'videobrief-2026-07-11-v1';

export function readAiConfig() {
  const baseUrl = process.env.OPENAI_BASE_URL?.trim() || '';
  return {
    provider: 'openai' as const,
    baseUrl,
    model: process.env.OPENAI_MODEL?.trim() || OPENAI_DEFAULT_MODEL,
    transcriptionModel:
      process.env.WHISPER_MODEL_NAME?.trim()
        ? `whisper.cpp:${process.env.WHISPER_MODEL_NAME.trim()}`
        : DEFAULT_TRANSCRIPTION_MODEL,
    promptVersion: AI_PROMPT_VERSION,
    apiKeyAvailable: Boolean(process.env.OPENAI_API_KEY?.trim()),
  };
}
