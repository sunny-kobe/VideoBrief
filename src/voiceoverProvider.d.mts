import type { ShortVideoRenderConfig } from './shortVideoBrief';

export interface ResolvedVoiceoverConfig {
  engine: 'edge-tts' | 'gemini-tts' | 'macos-say';
  model: string;
  voice: string;
  rate: number;
  profile: string;
  style: string;
  pronunciations: Array<{ term: string; guidance: string; spokenText?: string }>;
}

export const VOICEOVER_PROVIDER_VERSION: string;
export const DEFAULT_VOICE_CACHE_DIR: string;
export function geminiFailurePolicy(
  status: number,
  message: string,
  attempt: number,
  quotaIds?: string[],
): {
  permanent: boolean;
  retryAfterMs: number | null;
};
export function resolveVoiceoverConfig(render?: Partial<ShortVideoRenderConfig>): ResolvedVoiceoverConfig;
export function applySpokenPronunciations(
  inputText: string,
  pronunciations?: ResolvedVoiceoverConfig['pronunciations'],
): string;
export function buildGeminiPrompt(inputText: string, config: ResolvedVoiceoverConfig): string;
export function voiceoverCacheKey(inputText: string, config: ResolvedVoiceoverConfig): string;
export function synthesizeVoiceover(
  inputText: string,
  render: Partial<ShortVideoRenderConfig>,
  options?: { cacheDir?: string; copyTo?: string },
): Promise<{
  key: string;
  path: string;
  extension: 'mp3' | 'wav' | 'aiff';
  cacheHit: boolean;
  config: ResolvedVoiceoverConfig;
  metadata: {
    audioSha256: string;
    bytes: number;
    mimeType: string;
    sourceSampleRate: number | null;
    finishReason: string | null;
  };
}>;
