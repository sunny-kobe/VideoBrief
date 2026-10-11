export const OPENAI_DEFAULT_MODEL = 'gpt-6.1-sol';
export const OPENAI_DEFAULT_REASONING_EFFORT = 'medium';
const reasoningEfforts = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AiReasoningEffort = typeof reasoningEfforts[number];
export const DEFAULT_TRANSCRIPTION_MODEL = 'whisper.cpp:large-v3-turbo-q5_0';
export const AI_PROMPT_VERSION = 'videobrief-2026-10-10-visual-v1';

export function readAiConfig() {
  const baseUrl = process.env.OPENAI_BASE_URL?.trim() || '';
  const reasoningEffort = process.env.OPENAI_REASONING_EFFORT?.trim() || OPENAI_DEFAULT_REASONING_EFFORT;
  if (!reasoningEfforts.includes(reasoningEffort as AiReasoningEffort)) {
    throw new Error('OPENAI_REASONING_EFFORT 必须为 low、medium、high、xhigh 或 max。');
  }
  return {
    provider: 'openai' as const,
    baseUrl,
    model: process.env.OPENAI_MODEL?.trim() || OPENAI_DEFAULT_MODEL,
    reasoningEffort: reasoningEffort as AiReasoningEffort,
    transcriptionModel:
      process.env.WHISPER_MODEL_NAME?.trim()
        ? `whisper.cpp:${process.env.WHISPER_MODEL_NAME.trim()}`
        : DEFAULT_TRANSCRIPTION_MODEL,
    promptVersion: AI_PROMPT_VERSION,
    apiKeyAvailable: Boolean(process.env.OPENAI_API_KEY?.trim()),
  };
}
