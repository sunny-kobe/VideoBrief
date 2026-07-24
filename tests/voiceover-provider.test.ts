import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applySpokenPronunciations,
  buildGeminiPrompt,
  geminiFailurePolicy,
  resolveVoiceoverConfig,
  voiceoverCacheKey,
} from '../src/voiceoverProvider.mjs';

test('keeps legacy Edge projects on the Edge adapter', () => {
  const config = resolveVoiceoverConfig({ voice: 'zh-CN-YunjianNeural', rate: 194 });
  assert.equal(config.engine, 'edge-tts');
  assert.equal(config.model, 'edge-tts-universal');
});

test('resolves an explicit Gemini voice profile without exposing credentials', () => {
  const config = resolveVoiceoverConfig({
    voiceEngine: 'gemini-tts',
    voiceModel: 'gemini-3.1-flash-tts-preview',
    voice: 'Charon',
    rate: 100,
    voiceProfile: 'natural-tech-zh-v1',
    voiceStyle: '克制、自然。',
    pronunciations: [{ term: 'read_pdf', guidance: '读作 read underscore PDF' }],
  });
  assert.deepEqual(config, {
    engine: 'gemini-tts',
    model: 'gemini-3.1-flash-tts-preview',
    voice: 'Charon',
    rate: 100,
    profile: 'natural-tech-zh-v1',
    style: '克制、自然。',
    pronunciations: [{ term: 'read_pdf', guidance: '读作 read underscore PDF' }],
  });
});

test('Gemini prompt preserves the exact source text and includes pronunciation guidance', () => {
  const config = resolveVoiceoverConfig({
    voiceEngine: 'gemini-tts',
    voice: 'Charon',
    voiceStyle: '自然讲述。',
    pronunciations: [{ term: 'read_pdf', guidance: '读作 read underscore PDF' }],
  });
  const original = 'README 给出的路径是先安装，再调用 read_pdf。';
  const prompt = buildGeminiPrompt(original, config);
  assert.match(prompt, /自然讲述/);
  assert.match(prompt, /read underscore PDF/);
  assert.ok(prompt.endsWith(original));
});

test('Gemini prompt omits pronunciation rules unrelated to the current segment', () => {
  const config = resolveVoiceoverConfig({
    voiceEngine: 'gemini-tts',
    voice: 'Charon',
    pronunciations: [
      { term: 'SylphxAI', guidance: '品牌读法' },
      { term: 'read_pdf', guidance: 'read underscore PDF' },
    ],
  });
  const prompt = buildGeminiPrompt('调用 read_pdf。', config);
  assert.doesNotMatch(prompt, /品牌读法/);
  assert.match(prompt, /read underscore PDF/);
});

test('non-prompt voice engines can use spoken aliases without changing canonical text', () => {
  const original = 'RepoPrompt CE 使用 CodeMaps 整理上下文。';
  const spoken = applySpokenPronunciations(original, [
    { term: 'RepoPrompt CE', guidance: '分开读', spokenText: 'Repo Prompt C E' },
    { term: 'CodeMaps', guidance: '分开读', spokenText: 'Code Maps' },
  ]);
  assert.equal(spoken, 'Repo Prompt C E 使用 Code Maps 整理上下文。');
  assert.equal(original, 'RepoPrompt CE 使用 CodeMaps 整理上下文。');
});

test('voice cache key changes with style and pronunciation rules', () => {
  const base = resolveVoiceoverConfig({ voiceEngine: 'gemini-tts', voice: 'Charon' });
  const styled = { ...base, style: '更自然' };
  const pronounced = {
    ...base,
    pronunciations: [{ term: 'SylphxAI', guidance: '分开读品牌名和 AI' }],
  };
  assert.notEqual(voiceoverCacheKey('同一文案', base), voiceoverCacheKey('同一文案', styled));
  assert.notEqual(
    voiceoverCacheKey('包含 SylphxAI 的同一文案', base),
    voiceoverCacheKey('包含 SylphxAI 的同一文案', pronounced),
  );
  assert.equal(voiceoverCacheKey('同一文案', base), voiceoverCacheKey('同一文案', pronounced));
});

test('retries transient generic Gemini 400 responses but keeps real client errors permanent', () => {
  assert.deepEqual(geminiFailurePolicy(400, 'Request contains an invalid argument.', 1), {
    permanent: false,
    retryAfterMs: 5_000,
  });
  assert.deepEqual(geminiFailurePolicy(400, 'Request contains an invalid argument.', 2), {
    permanent: false,
    retryAfterMs: 10_000,
  });
  assert.deepEqual(geminiFailurePolicy(400, 'Request contains an invalid argument.', 3), {
    permanent: false,
    retryAfterMs: 15_000,
  });
  assert.deepEqual(geminiFailurePolicy(400, 'Request contains an invalid argument.', 4), {
    permanent: true,
    retryAfterMs: null,
  });
  assert.equal(geminiFailurePolicy(400, 'voiceName is invalid', 1).permanent, true);
  assert.equal(geminiFailurePolicy(404, 'model not found', 1).permanent, true);
});

test('adds a safety margin to Gemini quota retry delays', () => {
  assert.deepEqual(geminiFailurePolicy(429, 'Please retry in 58.5s.', 1), {
    permanent: false,
    retryAfterMs: 63_500,
  });
});

test('does not retry an exhausted Gemini free daily request quota', () => {
  assert.deepEqual(geminiFailurePolicy(
    429,
    'Please retry in 19s.',
    1,
    ['GenerateRequestsPerDayPerProjectPerModel-FreeTier'],
  ), {
    permanent: true,
    retryAfterMs: null,
  });
});
