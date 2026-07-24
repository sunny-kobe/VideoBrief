import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyNarrationTranscript } from '../scripts/lib/narration-verification.mjs';

test('accepts a complete narration with common ASR homophones', () => {
  const result = verifyNarrationTranscript(
    'AI 读完 PDF，不等于它读对了。再调用 read_pdf。',
    'AI读完PDF不等于他读对了，再调用read下滑线PDF。',
  );
  assert.equal(result.passed, true);
  assert.ok(result.similarity > 0.9);
});

test('rejects a transcript that drops most of the narration', () => {
  const result = verifyNarrationTranscript(
    '第一段完整内容。第二段完整内容。第三段完整内容。第四段完整内容。',
    '第一段完整内容。',
  );
  assert.equal(result.passed, false);
  assert.ok(result.lengthRatio < 0.75);
});

test('rejects a transcript dominated by repeated extra content', () => {
  const result = verifyNarrationTranscript('一句原文。', '一句原文。一句原文。一句原文。一句原文。');
  assert.equal(result.passed, false);
  assert.ok(result.lengthRatio > 1.25);
});

test('flags a protected pronunciation term that ASR does not match exactly', () => {
  const result = verifyNarrationTranscript(
    'SylphxAI 可以保留 PDF 证据。',
    'SelfX AI 可以保留 PDF 证据。',
    ['SylphxAI', 'PDF'],
  );
  assert.equal(result.passed, true);
  assert.deepEqual(result.termChecks, [
    { term: 'SylphxAI', aliases: [], relevant: true, matched: false, matchedAlias: '' },
    { term: 'PDF', aliases: [], relevant: true, matched: true, matchedAlias: 'PDF' },
  ]);
  assert.match(result.warnings.join(' '), /SylphxAI/);
});

test('ignores configured pronunciation terms absent from the current narration', () => {
  const result = verifyNarrationTranscript('只朗读当前句子。', '只朗读当前句子。', ['read_pdf']);
  assert.deepEqual(result.termChecks, [
    { term: 'read_pdf', aliases: [], relevant: false, matched: true, matchedAlias: '' },
  ]);
});

test('accepts an explicit ASR alias for a protected pronunciation term', () => {
  const result = verifyNarrationTranscript(
    'SylphxAI 可以保留 PDF 证据。',
    'SelfX AI 可以保留 PDF 证据。',
    [{ term: 'SylphxAI', aliases: ['SelfX AI'] }],
  );
  assert.deepEqual(result.termChecks, [{
    term: 'SylphxAI', aliases: ['SelfX AI'], relevant: true, matched: true, matchedAlias: 'SelfX AI',
  }]);
  assert.doesNotMatch(result.warnings.join(' '), /SylphxAI/);
});
