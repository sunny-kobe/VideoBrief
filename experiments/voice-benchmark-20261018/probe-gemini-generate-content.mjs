import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Same advertised model, using its live-listed generateContent method.
process.loadEnvFile('.env.local');
const args = process.argv.slice(2);
const modelOptions = new Map([
  ['--model=gemini-3.8-flash-lite-tts', ['gemini-3.8-flash-lite-tts', 'gemini-38-lite-charon']],
  ['--model=gemini-2.5-flash-preview-tts', ['gemini-2.5-flash-preview-tts', 'gemini-25-flash-charon']],
]);
if (args.some((arg) => arg !== '--voice=Kore' && !modelOptions.has(arg)) || args.filter(arg => arg.startsWith('--model=')).length > 1) throw new Error('Unsupported audition arguments');
const voice = args.includes('--voice=Kore') ? 'Kore' : 'Charon';
const selectedModel = modelOptions.get(args.find(arg => arg.startsWith('--model=')));
if (selectedModel && voice !== 'Charon') throw new Error('Additional model comparisons use Charon');
const input = JSON.parse(readFileSync('output/voice-benchmark-20261018/available-api/results.json', 'utf8'));
const row = { id: selectedModel?.[1] ?? (voice === 'Charon' ? 'gemini-38-generatecontent' : 'gemini-38-kore'), provider: 'Google Gemini', model: selectedModel?.[0] ?? 'gemini-3.8-flash-tts', voice, language: '普通话', text: input.text,
  styleControl: '未发送额外风格指令，保留原文；本次验证 generateContent 接口', sourceUrl: 'https://ai.google.dev/gemini-api/docs/speech-generation', costNote: '现有项目接口单次短样；实际金额未返回。' };
const base = resolve('output/voice-benchmark-20261018/available-api');
if ([resolve(base, `${row.id}.wav`), resolve(base, `${row.id}.receipt.json`)].some((path) => existsSync(path))) {
  throw new Error('This take already exists; refusing another API call.');
}
try {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${row.model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: input.text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: row.voice } } } } }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = await response.json();
  row.httpStatus = response.status;
  if (!response.ok) { row.status = 'blocked'; row.reason = `generateContent 返回 HTTP ${response.status} / ${body.error?.status || 'unknown'}。`; }
  else {
    const part = body.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data);
    if (!part) throw new Error('no_audio');
    const raw = Buffer.from(part.inlineData.data, 'base64');
    let audio = raw;
    if (!raw.subarray(0, 4).equals(Buffer.from('RIFF'))) {
      if (!/^audio\/(?:L16|pcm)/i.test(part.inlineData.mimeType)) throw new Error('unsupported_audio');
      const rate = Number(part.inlineData.mimeType.match(/rate=(\d+)/i)?.[1] || 24000);
      const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(raw.length + 36, 4); header.write('WAVE', 8); header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(raw.length, 40); audio = Buffer.concat([header, raw]);
    }
    row.audioPath = resolve(base, `${row.id}.wav`); writeFileSync(row.audioPath, audio, { flag: 'wx' });
    row.status = 'generated'; row.audioSha256 = createHash('sha256').update(audio).digest('hex'); row.usage = body.usageMetadata ?? null;
  }
} catch (error) { row.status = 'blocked'; row.reason = `generateContent 未获得音频：${error.name} / ${error.cause?.code || 'response-error'}。`; }
writeFileSync(resolve(base, `${row.id}.receipt.json`), JSON.stringify(row, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ id: row.id, status: row.status, httpStatus: row.httpStatus, reason: row.reason }));
