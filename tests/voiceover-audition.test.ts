import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  buildVoiceoverAuditionPlan,
  runVoiceoverAudition,
} from '../scripts/lib/voiceover-audition.mjs';

const project = {
  id: 'voice-fixture',
  render: {
    voiceEngine: 'edge-tts', voice: 'zh-CN-YunxiNeural', rate: 180,
    voiceStyle: '自然讲述', voiceProfile: 'natural-tech-zh-v1',
  },
  scenes: [{ id: 's1', enabled: true, narration: '原始开场。' }],
};
const candidate = { variants: [{ id: 'a', label: '原版', text: '原始开场。' }, { id: 'b', label: '口语版', text: '你看，机翼弯成这样了。' }] };

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'videobrief-audition-'));
  return { cwd, workDir: join(cwd, 'output/voice-auditions/example'), cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

test('prepare does not write files or call a voice provider', async () => {
  const f = fixture();
  try {
    const plan = buildVoiceoverAuditionPlan(project, candidate, { cwd: f.cwd, workDir: f.workDir });
    let calls = 0;
    const result = await runVoiceoverAudition(plan, { synthesize: async () => { calls += 1; throw new Error('unexpected call'); } });
    assert.equal(calls, 0);
    assert.equal(existsSync(join(f.cwd, 'output')), false);
    assert.equal(result.status, 'prepared');
    assert.equal(plan.voice.engine, 'edge-tts');
    assert.equal(plan.voice.effectiveStyle, '');
    assert.notEqual(plan.variants[0].cacheKey, plan.variants[1].cacheKey);
  } finally { f.cleanup(); }
});

test('rejects missing, empty, oversized, duplicate or provider-overriding variants', () => {
  const f = fixture();
  try {
    const plan = (input: unknown) => buildVoiceoverAuditionPlan(project, input, { cwd: f.cwd, workDir: f.workDir });
    for (const input of [{}, { variants: [] }, { variants: [{ id: 'a', text: ' ' }] }, { variants: [{ id: 'a', text: 42 }] }, { variants: [{ id: 'a', text: '字'.repeat(601) }] }, { variants: [{ id: 'a', text: '一' }, { id: 'a', text: '二' }] }, { variants: [{ id: 'a', text: '一', voiceEngine: 'gemini-tts' }] }]) {
      assert.throws(() => plan(input));
    }
    assert.throws(() => buildVoiceoverAuditionPlan({ ...project, render: { voiceEngine: 'missing' } }, candidate, { cwd: f.cwd, workDir: f.workDir }), /voiceEngine/);
  } finally { f.cleanup(); }
});

test('only renders inside a fresh isolated audition directory and refuses symlinks', async () => {
  const f = fixture();
  try {
    assert.throws(() => buildVoiceoverAuditionPlan(project, candidate, { cwd: f.cwd, workDir: join(f.cwd, 'public/project-assets/sample') }), /voice-auditions/);
    const link = join(f.cwd, 'output');
    symlinkSync(tmpdir(), link);
    assert.throws(() => buildVoiceoverAuditionPlan(project, candidate, { cwd: f.cwd, workDir: f.workDir }), /symbolic link/);
  } finally { f.cleanup(); }
});

test('render binds text, audio bytes, actual duration and pending human review without changing engine', async () => {
  const f = fixture();
  try {
    const plan = buildVoiceoverAuditionPlan(project, candidate, { cwd: f.cwd, workDir: f.workDir });
    const calls: string[] = [];
    const receipt = await runVoiceoverAudition(plan, {
      render: true,
      synthesize: async (text: string, render: Record<string, unknown>, options: { cacheDir: string }) => {
        assert.equal(render.voiceEngine, 'edge-tts');
        assert.equal(render.voice, project.render.voice);
        assert.ok(options.cacheDir.startsWith(f.workDir));
        calls.push(text);
        const path = join(f.workDir, `stub-${calls.length}.mp3`);
        writeFileSync(path, text);
        return { path, key: plan.variants[calls.length - 1].cacheKey, extension: 'mp3', cacheHit: false, config: { engine: 'edge-tts', voice: project.render.voice }, metadata: { audioSha256: createHash('sha256').update(text).digest('hex') } };
      },
      measureDuration: async () => 2.75,
    });
    assert.deepEqual(calls, candidate.variants.map(v => v.text));
    assert.equal(receipt.status, 'awaiting-human-listening');
    assert.equal(receipt.variants[1].durationSeconds, 2.75);
    assert.equal(receipt.variants[1].text, candidate.variants[1].text);
    assert.equal(receipt.variants[1].voice?.engine, 'edge-tts');
    assert.equal(JSON.parse(readFileSync(join(f.workDir, 'receipt.json'), 'utf8')).status, 'awaiting-human-listening');
    await assert.rejects(() => runVoiceoverAudition(plan, { render: true }), /already exists/);
  } finally { f.cleanup(); }
});

test('provider failure stops without engine fallback or a successful receipt', async () => {
  const f = fixture();
  try {
    const plan = buildVoiceoverAuditionPlan(project, candidate, { cwd: f.cwd, workDir: f.workDir });
    let calls = 0;
    await assert.rejects(() => runVoiceoverAudition(plan, { render: true, synthesize: async () => { calls += 1; throw new Error('quota exhausted'); } }), /quota exhausted/);
    assert.equal(calls, 1);
    assert.equal(existsSync(join(f.workDir, 'receipt.json')), false);
  } finally { f.cleanup(); }
});

test('Gemini receipts disclose that numeric rate is not an active provider control', () => {
  const f = fixture();
  try {
    const plan = buildVoiceoverAuditionPlan({ ...project, render: { voiceEngine: 'gemini-tts', voice: 'Charon', voiceStyle: '自然讲述', rate: 100 } }, candidate, { cwd: f.cwd, workDir: f.workDir });
    assert.equal(plan.voice.effectiveRate, null);
    assert.equal(plan.voice.effectiveStyle, '自然讲述');
  } finally { f.cleanup(); }
});

test('reuses matching audio bytes from the existing cache without a provider call', async () => {
  const f = fixture();
  try {
    const plan = buildVoiceoverAuditionPlan(project, { variants: [candidate.variants[0]] }, { cwd: f.cwd, workDir: f.workDir });
    const variant = plan.variants[0];
    const cache = join(f.cwd, 'output/voice-cache');
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, `${variant.cacheKey}.mp3`), 'cached-bytes');
    writeFileSync(join(cache, `${variant.cacheKey}.json`), JSON.stringify({ key: variant.cacheKey, providerVersion: plan.providerVersion, textSha256: variant.textSha256, audioSha256: createHash('sha256').update('cached-bytes').digest('hex') }));
    const result = await runVoiceoverAudition(plan, { render: true, synthesize: async () => { throw new Error('provider must not run'); }, measureDuration: async () => 1.8 });
    assert.equal(result.variants[0].cacheSource, 'existing-voice-cache');
    assert.equal(readFileSync(join(cache, `${variant.cacheKey}.mp3`), 'utf8'), 'cached-bytes');
  } finally { f.cleanup(); }
});

test('CLI prepares a real input pair without creating its output directory', () => {
  const f = fixture();
  try {
    const briefPath = join(f.cwd, 'project.json');
    const candidatePath = join(f.cwd, 'candidate.json');
    writeFileSync(briefPath, JSON.stringify(project));
    writeFileSync(candidatePath, JSON.stringify(candidate));
    const result = spawnSync(process.execPath, [resolve('scripts/preview-voiceover.mjs'), `--brief=${briefPath}`, `--candidate=${candidatePath}`, '--work-dir=output/voice-auditions/example'], { cwd: f.cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'prepared');
    assert.equal(existsSync(f.workDir), false);
  } finally { f.cleanup(); }
});
