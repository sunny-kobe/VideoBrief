// Read-only diagnostics. Historical observations are not current delivery approval.
export function measuredNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function stagesOf(manifest) {
  return {
    ...(manifest?.productionMetrics?.elapsed?.stages ?? {}),
    ...(manifest?.productionMetrics?.stages ?? {}),
  };
}

export function efficiencySample(project, manifest) {
  const stages = stagesOf(manifest);
  const cache = manifest?.productionMetrics?.renderCache;
  const count = measuredNumber(cache?.sceneSegments);
  const hits = measuredNumber(cache?.sceneSegmentCacheHits);
  const misses = measuredNumber(cache?.sceneSegmentCacheMisses);
  const validCache = count > 0 && hits !== null && misses !== null && hits + misses === count;
  const cacheMode = !validCache ? 'unknown' : hits === 0 ? 'cold' : misses === 0 ? 'warm' : 'partial';
  const renderMs = measuredNumber(stages.render?.wallMs);
  const durationSeconds = measuredNumber(manifest?.render?.duration);
  return {
    projectId: project.id,
    renderedAt: manifest?.renderedAt ?? null,
    format: `${manifest?.render?.width ?? '?'}x${manifest?.render?.height ?? '?'}@${manifest?.render?.fps ?? '?'}`,
    strategy: manifest?.render?.renderStrategy ?? cache?.strategy ?? 'unknown',
    cacheMode,
    sceneCount: count,
    cacheHitRatio: validCache ? hits / count : null,
    durationSeconds,
    renderMs,
    technicalProofMs: measuredNumber(stages.technicalProof?.wallMs),
    renderSecondsPerVideoSecond: renderMs !== null && durationSeconds > 0 ? renderMs / 1000 / durationSeconds : null,
    recordedProofPassed: manifest?.proof?.passed === true,
  };
}

export function distribution(values) {
  const numbers = values.filter((value) => measuredNumber(value) !== null).sort((a, b) => a - b);
  const n = numbers.length;
  return {
    measured: n,
    missing: values.length - n,
    median: n ? (numbers[Math.floor((n - 1) / 2)] + numbers[Math.ceil((n - 1) / 2)]) / 2 : null,
    p90: n ? numbers[Math.ceil(n * 0.9) - 1] : null,
  };
}

export function summarizeEfficiencySamples(samples) {
  const groups = new Map();
  for (const sample of samples) {
    const key = `${sample.format}/${sample.strategy}/${sample.cacheMode}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sample);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([group, rows]) => ({
    group,
    samples: rows.length,
    renderMs: distribution(rows.map((row) => row.renderMs)),
    technicalProofMs: distribution(rows.map((row) => row.technicalProofMs)),
    renderSecondsPerVideoSecond: distribution(rows.map((row) => row.renderSecondsPerVideoSecond)),
  }));
}

export function renderEfficiencySummary(report) {
  const number = (value, unit = 'ms') => measuredNumber(value) === null ? '未记录' : `${value.toFixed(1)} ${unit}`;
  const stages = report.production.elapsed.stages;
  const ranked = Object.entries(stages)
    .filter(([, stage]) => measuredNumber(stage.wallMs) !== null)
    .sort((a, b) => b[1].wallMs - a[1].wallMs);
  const slowSources = report.sources.runs
    .filter((source) => measuredNumber(source.durationMs) !== null)
    .sort((a, b) => b.durationMs - a.durationMs).slice(0, 3);
  const cache = report.production.renderCache;
  const lines = [
    `项目：${report.projectId}`,
    '口径：历史记录诊断；未重新核验产物新鲜度，不代表当前交付批准。',
    `项目日历跨度：${number(report.production.elapsed.projectCalendarMs)}（包含等待，不是人工工时）`,
    `审片会话记录：${number(report.production.operatorActive.manualReviewSeconds, 's')}（${report.production.operatorActive.measurement}；不覆盖全部人工投入）`,
    '阶段耗时（可能嵌套，不累加为总耗时）：',
    ...ranked.map(([name, stage]) => `- ${name}：${number(stage.wallMs)}`),
    ...(ranked.length ? [] : ['- 未记录']),
    `场景缓存：${cache ? `${cache.sceneSegmentCacheHits ?? '?'} 命中 / ${cache.sceneSegments ?? '?'} 幕` : '未记录'}`,
    `失败记录：AI ${report.production.failureCost.failedAiCalls}；渲染 ${report.production.failureCost.renderFailures}；来源 ${report.sources.failed}`,
    '下一步：',
  ];
  if (report.sources.failed) lines.push('- 先处理失败来源，避免反复启动后续策划。');
  if (report.voiceoverPreflight.failedAttemptCount > 0) lines.push(`- 配音预检累计失败 ${report.voiceoverPreflight.failedAttemptCount} 次；先查看预检 issues 和失败记录，再重试。`);
  if (ranked.length) lines.push(`- 优先检查已测量的最长阶段 ${ranked[0][0]}；这不证明它是端到端瓶颈。`);
  if (cache?.sceneSegmentCacheHits > 0) lines.push('- 已有逐幕缓存命中；局部修改继续使用现有增量渲染，不清空缓存。');
  for (const source of slowSources) lines.push(`- 来源 ${source.sourceId} 最近一次处理：${number(source.durationMs)}；状态 ${source.status}，累计尝试 ${source.attempts} 次。`);
  lines.push('缺口：素材搜索、选片、脚本修改及全部人工工时未被完整测量；缺失值不能记作 0。');
  lines.push('比较工具时须使用相同素材、输出规格和验收要求，分别测首轮与局部修改；当前记录不能推出对外提速倍数。');
  return `${lines.join('\n')}\n`;
}
