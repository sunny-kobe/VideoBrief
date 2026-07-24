import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_NEW_PROJECT_VOICE,
  NATURAL_TECH_ZH_VOICE_STYLE,
} from '../src/voiceProfile';

test('new projects use the selected natural Chinese voice profile explicitly', () => {
  assert.deepEqual(DEFAULT_NEW_PROJECT_VOICE, {
    voice: 'Charon',
    rate: 100,
    voiceEngine: 'gemini-tts',
    voiceModel: 'gemini-3.1-flash-tts-preview',
    voiceProfile: 'natural-tech-zh-v1',
    voiceStyle: NATURAL_TECH_ZH_VOICE_STYLE,
    voiceGenerationMode: 'auto',
  });
  assert.match(NATURAL_TECH_ZH_VOICE_STYLE, /不要增加、删减或改写内容/);
});
