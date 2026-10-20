import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

// Explicitly requested short audition; no production project writes and no fallback provider.
const output = resolve('output/voice-benchmark-20261018/available-api');
if (existsSync(output)) throw new Error('Keep the previous take; this output already exists.');
mkdirSync(output, { recursive: true });
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (!process.env.GEMINI_API_KEY && existsSync('.env')) process.loadEnvFile('.env');
const text = '外面这么冷，空调还上哪儿找热？秘密在机器里的制冷剂：它比室外空气更冷，热就能传给它。压缩机再把温度抬高，把热送进屋。冷空气里有热，但搬热也得用电。';
const style = '请用自然普通话，像和朋友解释一个有趣的日常现象。声音温暖克制、有交流感，不用新闻播音腔或广告腔。中等语速，疑问句带一点好奇，因果与结论轻微强调。停顿按意思，不故意每句停一样久。严格照稿，不添词、不假笑。';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const rows = [];
const blocked = (id, provider, model, voice, reason, sourceUrl) => ({ id, provider, model, voice, language: '普通话', status: 'blocked', reason, sourceUrl, costNote: '未获得音频；实际扣费未知，未开通新付费计划。' });
const record = (row) => {
  rows.push(row);
  writeFileSync(resolve(output, `${row.id}.receipt.json`), JSON.stringify({ ...row, text, textSha256: sha(text), style, recordedAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ id: row.id, status: row.status, model: row.model, reason: row.reason, bytes: row.bytes }));
};

for (const voice of ['Charon', 'Kore']) {
  const id = `gemini-${voice.toLowerCase()}`, model = 'gemini-3.8-flash-tts';
  const sourceUrl = 'https://ai.google.dev/gemini-api/docs/speech-generation';
  if (!process.env.GEMINI_API_KEY) { record(blocked(id, 'Google Gemini', model, voice, '当前项目没有 Gemini 密钥。', sourceUrl)); continue; }
  if (rows.some((row) => row.provider === 'Google Gemini' && row.status === 'blocked')) {
    record(blocked(id, 'Google Gemini', model, voice, '同一提供方首个请求失败，停止重复消耗，不换引擎。', sourceUrl)); continue;
  }
  try {
    const start = Date.now();
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ model, input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }] }], response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice }] } }),
      signal: AbortSignal.timeout(100_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      record({ ...blocked(id, 'Google Gemini', model, voice, `官方 API 返回 HTTP ${response.status} / ${body.error?.status || '未返回状态'}，没有生成音频。`, sourceUrl), httpStatus: response.status, latencyMs: Date.now() - start }); continue;
    }
    const part = (body.steps ?? []).filter((step) => step.type === 'model_output').flatMap((step) => step.content ?? []).filter((part) => part.type === 'audio' && part.data).at(-1);
    if (!part) throw new Error('no-audio-in-response');
    const audio = Buffer.from(part.data, 'base64');
    if (audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') throw new Error('unexpected-audio-format');
    const audioPath = resolve(output, `${id}.wav`);
    writeFileSync(audioPath, audio, { flag: 'wx' });
    record({ id, provider: 'Google Gemini', model, voice, language: '普通话', status: 'generated', audioPath, audioSha256: sha(audio), bytes: audio.length, latencyMs: Date.now() - start, usage: body.usage ?? body.usageMetadata ?? null, sourceUrl, costNote: '使用现有项目接口；实际金额提供方未返回，待账单确认。' });
  } catch (error) {
    record(blocked(id, 'Google Gemini', model, voice, `实际合成失败：${error.name === 'TimeoutError' ? '100 秒超时' : ['no-audio-in-response', 'unexpected-audio-format'].includes(error.message) ? error.message : '网络或响应错误'}。`, sourceUrl));
  }
}

{
  const id = 'openai-marin', provider = 'OpenAI 模型（现有兼容接口）', model = 'gpt-4o-mini-tts', voice = 'marin';
  const sourceUrl = 'https://developers.openai.com/api/docs/guides/text-to-speech';
  const key = process.env.OPENAI_API_KEY;
  if (!key) record(blocked(id, provider, model, voice, '当前项目没有配置 OpenAI 兼容密钥。', sourceUrl));
  else try {
    const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const response = await fetch(base.replace(/\/$/, '') + '/audio/speech', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, voice, input: text, instructions: style, response_format: 'wav' }), signal: AbortSignal.timeout(45_000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok || !String(response.headers.get('content-type')).includes('audio') || bytes.toString('ascii', 0, 4) !== 'RIFF') {
      record({ ...blocked(id, provider, model, voice, `现有兼容接口实际请求返回 HTTP ${response.status}，未得到有效 WAV；不将该密钥发往其他服务。`, sourceUrl), httpStatus: response.status });
    } else {
      const audioPath = resolve(output, `${id}.wav`); writeFileSync(audioPath, bytes, { flag: 'wx' });
      record({ id, provider, model, voice, language: '普通话', status: 'generated', audioPath, audioSha256: sha(bytes), bytes: bytes.length, sourceUrl, costNote: '兼容服务实际金额未返回；未切换到其他服务。' });
    }
  } catch (error) { record(blocked(id, provider, model, voice, `现有兼容接口${error.name === 'TimeoutError' ? '45 秒超时' : '连接或响应失败'}。`, sourceUrl)); }
}
writeFileSync(resolve(output, 'results.json'), JSON.stringify({ schemaVersion: 1, title: '同稿中文语音短试听', text, style, generatedAt: new Date().toISOString(), rows }, null, 2) + '\n', { flag: 'wx' });
