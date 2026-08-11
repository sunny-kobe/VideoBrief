const DEFAULT_SEGMENT_DURATION_SECONDS = 20;

function normalizedDuration(value, project, sceneCount) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 5) {
    const target = Number(project?.brief?.targetDurationSeconds);
    if (Number.isFinite(target) && target >= sceneCount * 5) return Math.min(120, target / sceneCount);
    return DEFAULT_SEGMENT_DURATION_SECONDS;
  }
  return Math.min(120, duration);
}

export function sceneInformationVisualKind(scene) {
  const text = `${scene.title ?? ''} ${scene.subtitle ?? ''} ${scene.visualRequirement ?? ''}`;
  if (/全系最强|专业型号|专业选择/i.test(text)) return 'positioning';
  if (/验证工作|持续迭代|复杂 Agent|复杂 agent/i.test(text)) return 'iteration';
  if (/1M|128K|上下文|最大输出|API ID|每百万 tokens|规格/i.test(text)) return 'specifications';
  if (/benchmark|评测|Opus 4\.8|同价/i.test(text)) return 'benchmark';
  if (/Fast mode|更快|更贵|价格也翻倍|Mythos|网络安全/i.test(text)) return 'tradeoffs';
  if (/A\/B|成功率|总成本|决定迁移|再迁移/i.test(text)) return 'decision';
  if (/Brief|目标|受众|画幅|核心观点/i.test(text)) return 'brief';
  if (/素材|来源|核验|权利|project\.json/i.test(text)) return 'evidence';
  if (/发布|市场|draft-unpublished|market_status/i.test(text)) return 'statuses';
  if (/确认|批准|脚本|候选画面|合成/i.test(text)) return 'approval';
  if (/proof|指纹|音轨|字幕|时间轴|抽帧|验收/i.test(text)) return 'proof';
  return 'flow';
}

export function buildSceneInformationLayerPlan(project, segmentDurationSeconds) {
  const scenes = (project.scenes ?? []).filter((scene) => scene.enabled !== false);
  if (!scenes.length) throw new Error('Canonical project has no enabled scenes.');
  const duration = normalizedDuration(segmentDurationSeconds, project, scenes.length);
  const ids = new Set();
  return scenes.map((scene, index) => {
    if (!scene.id || ids.has(scene.id)) throw new Error('Enabled scene ids must be unique and non-empty.');
    ids.add(scene.id);
    return {
      sceneId: scene.id,
      index,
      title: String(scene.title ?? ''),
      subtitle: String(scene.subtitle ?? ''),
      narration: String(scene.narration ?? ''),
      visualRequirement: String(scene.visualRequirement ?? ''),
      visualKind: sceneInformationVisualKind(scene),
      sourceStart: Number((index * duration).toFixed(3)),
      sourceEnd: Number(((index + 1) * duration).toFixed(3)),
      matchReason: `原创信息层独立呈现「${scene.title || scene.id}」及对应结构，只作本幕视觉说明，不冒充事实证据。`,
      rightsStatus: 'cleared',
      showEditorialOverlay: false,
    };
  });
}
