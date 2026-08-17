const internalProductionPhrases = [
  /制作说明[：:]/,
  /旁白使用.{0,80}(?:TTS|生成)/i,
  /使用合成旁白/,
  /成片未使用\s*AI/i,
  /由\s*VideoBrief.{0,40}(?:工作流|完成|生成)/i,
  /资料核验、?原创中文叙事/,
  /画面来源与许可[：:]/,
];

export function assertAudienceFacingPlatformDescription(description: string) {
  const matched = internalProductionPhrases.find((pattern) => pattern.test(description));
  if (matched) {
    throw new Error('平台简介包含内部制作或审计说明；请改为面向观众的创作者文案。');
  }
}
