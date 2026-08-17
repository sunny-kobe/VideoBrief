import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSauUploadArgs,
  normalizePublisherPlatform,
  normalizeSchedule,
  sanitizePublisherLog,
  type ProgrammaticPublisherPlatform,
} from '../src/programmaticPublisher';

const copy = {
  title: '为什么价格几分钟就能变？',
  description: '测试简介',
  hashtags: ['#电子价签', '商业观察'],
  generatedByAi: true,
};

function args(platform: ProgrammaticPublisherPlatform, extras: Record<string, unknown> = {}) {
  return buildSauUploadArgs({
    platform,
    accountName: 'daily-cause',
    videoPath: '/tmp/final.mp4',
    coverPath: '/tmp/cover.png',
    copy,
    bilibiliCategoryId: 201,
    ...extras,
  });
}

test('maps VideoBrief platform labels to social-auto-upload platform ids', () => {
  assert.equal(normalizePublisherPlatform('B站'), 'bilibili');
  assert.equal(normalizePublisherPlatform('小红书'), 'xiaohongshu');
  assert.equal(normalizePublisherPlatform('抖音'), 'douyin');
  assert.equal(normalizePublisherPlatform('视频号'), 'tencent');
  assert.equal(normalizePublisherPlatform('YouTube'), 'youtube');
  assert.throws(() => normalizePublisherPlatform('未知平台'), /暂不支持/);
});

test('builds argv without shell interpolation for all supported uploaders', () => {
  for (const platform of ['bilibili', 'douyin', 'xiaohongshu', 'tencent', 'youtube'] as const) {
    const value = args(platform);
    assert.deepEqual(value.slice(0, 2), [platform, 'upload-video']);
    assert.equal(value[value.indexOf('--title') + 1], copy.title);
    assert.equal(value[value.indexOf('--tags') + 1], '电子价签,商业观察');
  }
  assert.deepEqual(args('bilibili').slice(-4), ['--tid', '201', '--thumbnail', '/tmp/cover.png']);
  assert.ok(args('youtube').includes('--visibility'));
});

test('passes supported schedules and rejects unsupported YouTube scheduling', () => {
  assert.ok(args('douyin', { schedule: '2026-08-17 19:30' }).includes('--schedule'));
  assert.ok(args('xiaohongshu', { schedule: '2026-08-17 19:30' }).includes('--schedule'));
  assert.ok(args('tencent', { schedule: '2026-08-17 19:30' }).includes('--schedule'));
  assert.ok(args('bilibili', { schedule: '2026-08-17 19:30' }).includes('--schedule'));
  assert.throws(
    () => args('youtube', { schedule: '2026-08-17 19:30' }),
    /YouTube 适配器不支持定时发布/,
  );
});

test('passes platform-specific AI declarations to Douyin and WeChat Channels', () => {
  const douyinGenerated = args('douyin');
  assert.equal(douyinGenerated[douyinGenerated.indexOf('--declaration') + 1], '内容由AI生成');
  const generated = args('tencent');
  assert.equal(generated[generated.indexOf('--declaration') + 1], 'AI生成内容');
  const douyinNotGenerated = args('douyin', { copy: { ...copy, generatedByAi: false } });
  assert.equal(douyinNotGenerated.includes('--declaration'), false);
  const notGenerated = args('tencent', { copy: { ...copy, generatedByAi: false } });
  assert.equal(notGenerated.includes('--declaration'), false);
});

test('normalizes schedule to Asia/Shanghai and requires a future time', () => {
  const value = normalizeSchedule('2026-08-17 19:30', new Date('2026-08-16T00:00:00.000Z'));
  assert.equal(value.sauValue, '2026-08-17 19:30');
  assert.equal(value.isoValue, '2026-08-17T11:30:00.000Z');
  assert.throws(
    () => normalizeSchedule('2026-08-15 19:30', new Date('2026-08-16T00:00:00.000Z')),
    /必须晚于当前时间/,
  );
});

test('redacts sensitive publisher output before persisting logs', () => {
  const sanitized = sanitizePublisherLog('uploading\nCookie: secret\nauthorization=token\ndone');
  assert.equal(sanitized, 'uploading\n[sensitive line redacted]\n[sensitive line redacted]\ndone');
});
