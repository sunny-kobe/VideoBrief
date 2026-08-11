import assert from 'node:assert/strict';
import test from 'node:test';

import { planSubtitleCues } from '../scripts/lib/subtitle-cues.mjs';

test('subtitle cues use audible pauses near weighted phrase boundaries', () => {
  const cues = planSubtitleCues({
    phrases: ['第一句话。', '第二句话更长一些。', '最后一句。'],
    speechDuration: 9,
    silences: [{ start: 2.8, end: 3.2 }, { start: 6.6, end: 7 }],
  });
  assert.equal(cues.length, 3);
  assert.equal(cues[0].end, 3);
  assert.equal(cues[1].end, 6.8);
  assert.equal(cues[2].end, 9);
  assert.ok(cues.every((cue) => cue.alignment === 'silence-assisted'));
});

test('subtitle cues fall back to character-weighted timing without pauses', () => {
  const cues = planSubtitleCues({ phrases: ['短句。', '更长的一句话。'], speechDuration: 6 });
  assert.equal(cues[0].start, 0);
  assert.equal(cues[1].end, 6);
  assert.ok(cues.every((cue) => cue.alignment === 'character-weighted'));
});

test('subtitle cues merge one or two character wrap leftovers into adjacent cues', () => {
  const phrases = [
    '系统为章节记录素材哈希、使用的模',
    '型、提示版本、Brief、转录和帧时',
    '间。',
    '它们共同组成这次渲染的输入指纹，',
    '也决定这一章能否复用。',
  ];
  const cues = planSubtitleCues({
    phrases,
    speechDuration: 12.72,
    silences: [
      { start: 3.5, end: 3.78 },
      { start: 7.12, end: 7.4 },
      { start: 9.7, end: 10.02 },
    ],
  });

  assert.equal(cues.length, 4);
  assert.equal(cues.map((cue) => cue.text).join(''), phrases.join(''));
  assert.equal(cues[0].start, 0);
  assert.equal(cues.at(-1)?.end, 12.72);
  assert.ok(cues.every((cue) => Array.from(cue.text.replace(/\s/g, '')).length > 2));
});

test('subtitle cues merge a technical term that would flash for less than 750ms', () => {
  const cues = planSubtitleCues({
    phrases: ['官方还写了会话恢复和独立', 'worktree；', '环境要求是 macOS 14 以上，', 'DMG 为临时签名。'],
    speechDuration: 7.41,
    silences: [
      { start: 3.03, end: 3.23 },
      { start: 3.35, end: 3.566 },
      { start: 5.6, end: 5.85 },
    ],
  });

  assert.equal(cues.map((cue) => cue.text).join(''), '官方还写了会话恢复和独立 worktree；环境要求是 macOS 14 以上，DMG 为临时签名。');
  assert.ok(cues.every((cue) => cue.end - cue.start >= 0.75));
  assert.ok(cues.some((cue) => cue.text.includes('独立 worktree；')));
});
