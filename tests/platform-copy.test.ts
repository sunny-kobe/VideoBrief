import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAudienceFacingPlatformDescription } from '../src/platformCopy';

test('accepts an audience-facing description with concise required attribution', () => {
  assert.doesNotThrow(() => assertAudienceFacingPlatformDescription(
    '电子价签为什么几分钟就能改完全店价格？\n\n素材鸣谢：作者（CC BY 3.0）。',
  ));
});

test('rejects internal production notes in a platform description', () => {
  for (const description of [
    '制作说明：旁白使用 Gemini TTS 生成。',
    '本视频使用合成旁白；未使用 AI 生成画面。',
    '资料核验、原创中文叙事、剪辑与字幕由 VideoBrief 工作流完成。',
    '画面来源与许可：以下是完整生产审计清单。',
  ]) {
    assert.throws(
      () => assertAudienceFacingPlatformDescription(description),
      /平台简介包含内部制作或审计说明/,
    );
  }
});
