export const NATURAL_TECH_ZH_VOICE_STYLE = `像真实的中文科技内容创作者一样讲述。
声音克制、自然，有轻微交流感，不要新闻播音腔或广告腔。
使用中等语速，在转折和结论前自然停顿。
重点词只做轻微强调，不要夸张表演。
必须准确朗读原文，不要增加、删减或改写内容。`;

export const DEFAULT_NEW_PROJECT_VOICE = {
  voice: 'Charon',
  rate: 100,
  voiceEngine: 'gemini-tts' as const,
  voiceModel: 'gemini-3.1-flash-tts-preview',
  voiceProfile: 'natural-tech-zh-v1',
  voiceStyle: NATURAL_TECH_ZH_VOICE_STYLE,
  voiceGenerationMode: 'auto' as const,
};
