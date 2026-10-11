import workflowJson from '@/content/workflows/self-owned-explainer-v1/workflow.json';

export interface AudienceSampleWorkflowStage {
  id: string;
  label: string;
  gate: string;
  description: string;
}

export interface AudienceSampleReference {
  projectId: string;
  topicScore: number;
  topicScoreMax: number;
  role: string;
  learning: string;
}

export interface AudienceSampleWorkflow {
  schemaVersion: 1;
  id: string;
  label: string;
  title: string;
  direction: string;
  kickoffPromptPath: string;
  playbookPath: string;
  styleExperimentPath: string;
  performanceReviewPath: string;
  stages: AudienceSampleWorkflowStage[];
  samples: AudienceSampleReference[];
}

export interface AudienceSampleStyleExperimentFormat {
  id: string;
  label: string;
  slotsPerCycle: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  opening: string;
  progression: string[];
  closing: string;
}

export interface AudienceSampleStyleExperiment {
  schemaVersion: 2;
  id: string;
  label: string;
  status: 'active' | 'completed';
  startedAt: string;
  reviewAfterPublishedVideos: number;
  reviewDeadline: string;
  audiencePromise: string;
  hypothesis: string;
  topicGate: {
    requiredQuestions: string[];
    rejectionRules: string[];
  };
  formats: AudienceSampleStyleExperimentFormat[];
  productionDefaults: {
    cover: string;
    visualRules: string[];
  };
  measurement: {
    snapshotHours: number[];
    requiredMetrics: string[];
    baseline: {
      threeSecondBounceRate: number;
      averageWatchRatio: number;
      visibleInteractionRate: number;
      followerConversionNote: string;
    };
    targets: {
      maxThreeSecondBounceRate: number;
      minActionAverageWatchRatio: number;
      minConflictAverageWatchRatio: number;
      minVisibleInteractionRate: number;
      minimumVideosMeetingRetentionAndInteraction: number;
      followerConversionRule: string;
    };
    decisionRule: string;
    stopRule: string;
    reviewPath: string;
  };
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`受众样片流程缺少 ${field}。`);
  }
  return value.trim();
}

function uniqueValues(values: string[], field: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(`受众样片流程的 ${field} 不能重复。`);
  }
}

function positiveInteger(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`风格实验的 ${field} 必须是正整数。`);
  }
  return number;
}

function percentage(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw new Error(`风格实验的 ${field} 必须是 0 到 100 之间的数字。`);
  }
  return number;
}

function requiredTextList(value: unknown, field: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`风格实验的 ${field} 不能为空。`);
  }
  const items = value.map((item, index) => requiredText(item, `${field}[${index}]`));
  uniqueValues(items, field);
  return items;
}

export function parseAudienceSampleStyleExperiment(input: unknown): AudienceSampleStyleExperiment {
  if (!input || typeof input !== 'object') throw new Error('风格实验配置必须是对象。');
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== 2) throw new Error('风格实验只支持 schemaVersion=2。');
  if (value.status !== 'active' && value.status !== 'completed') {
    throw new Error('风格实验状态必须是 active 或 completed。');
  }

  const reviewAfterPublishedVideos = positiveInteger(
    value.reviewAfterPublishedVideos,
    'reviewAfterPublishedVideos',
  );
  const topicGate = value.topicGate as Record<string, unknown> | undefined;
  if (!topicGate) throw new Error('风格实验缺少 topicGate。');

  const rawFormats = Array.isArray(value.formats) ? value.formats : [];
  if (rawFormats.length < 2) throw new Error('双格式实验至少需要两个 formats。');
  const formats = rawFormats.map((format, index) => {
    if (!format || typeof format !== 'object') throw new Error(`风格实验格式 ${index + 1} 无效。`);
    const item = format as Record<string, unknown>;
    const minDurationSeconds = positiveInteger(item.minDurationSeconds, `formats[${index}].minDurationSeconds`);
    const maxDurationSeconds = positiveInteger(item.maxDurationSeconds, `formats[${index}].maxDurationSeconds`);
    if (maxDurationSeconds < minDurationSeconds) throw new Error(`风格实验格式 ${index + 1} 的时长上限不能小于下限。`);
    return {
      id: requiredText(item.id, `formats[${index}].id`),
      label: requiredText(item.label, `formats[${index}].label`),
      slotsPerCycle: positiveInteger(item.slotsPerCycle, `formats[${index}].slotsPerCycle`),
      minDurationSeconds,
      maxDurationSeconds,
      opening: requiredText(item.opening, `formats[${index}].opening`),
      progression: requiredTextList(item.progression, `formats[${index}].progression`),
      closing: requiredText(item.closing, `formats[${index}].closing`),
    };
  });
  uniqueValues(formats.map((format) => format.id), '格式 id');
  if (formats.reduce((total, format) => total + format.slotsPerCycle, 0) !== reviewAfterPublishedVideos) {
    throw new Error('风格实验的格式槽位总数必须等于复盘视频数。');
  }

  const defaults = value.productionDefaults as Record<string, unknown> | undefined;
  if (!defaults) throw new Error('风格实验缺少 productionDefaults。');

  const measurement = value.measurement as Record<string, unknown> | undefined;
  if (!measurement) throw new Error('风格实验缺少 measurement。');
  if (!Array.isArray(measurement.snapshotHours) || measurement.snapshotHours.length === 0) {
    throw new Error('风格实验的 snapshotHours 不能为空。');
  }
  const snapshotHours = measurement.snapshotHours.map((item, index) => (
    positiveInteger(item, `snapshotHours[${index}]`)
  ));
  if (snapshotHours.some((hour, index) => index > 0 && hour <= snapshotHours[index - 1])) {
    throw new Error('风格实验的 snapshotHours 必须严格递增。');
  }
  const reviewPath = requiredText(measurement.reviewPath, 'measurement.reviewPath');
  if (!reviewPath.startsWith('docs/')) throw new Error('风格实验复盘必须位于 docs/。');
  const baseline = measurement.baseline as Record<string, unknown> | undefined;
  if (!baseline) throw new Error('风格实验缺少 measurement.baseline。');
  const targets = measurement.targets as Record<string, unknown> | undefined;
  if (!targets) throw new Error('风格实验缺少 measurement.targets。');

  return {
    schemaVersion: 2,
    id: requiredText(value.id, 'id'),
    label: requiredText(value.label, 'label'),
    status: value.status,
    startedAt: requiredText(value.startedAt, 'startedAt'),
    reviewAfterPublishedVideos,
    reviewDeadline: requiredText(value.reviewDeadline, 'reviewDeadline'),
    audiencePromise: requiredText(value.audiencePromise, 'audiencePromise'),
    hypothesis: requiredText(value.hypothesis, 'hypothesis'),
    topicGate: {
      requiredQuestions: requiredTextList(topicGate.requiredQuestions, 'topicGate.requiredQuestions'),
      rejectionRules: requiredTextList(topicGate.rejectionRules, 'topicGate.rejectionRules'),
    },
    formats,
    productionDefaults: {
      cover: requiredText(defaults.cover, 'productionDefaults.cover'),
      visualRules: requiredTextList(defaults.visualRules, 'productionDefaults.visualRules'),
    },
    measurement: {
      snapshotHours,
      requiredMetrics: requiredTextList(measurement.requiredMetrics, 'measurement.requiredMetrics'),
      baseline: {
        threeSecondBounceRate: percentage(baseline.threeSecondBounceRate, 'baseline.threeSecondBounceRate'),
        averageWatchRatio: percentage(baseline.averageWatchRatio, 'baseline.averageWatchRatio'),
        visibleInteractionRate: percentage(baseline.visibleInteractionRate, 'baseline.visibleInteractionRate'),
        followerConversionNote: requiredText(baseline.followerConversionNote, 'baseline.followerConversionNote'),
      },
      targets: {
        maxThreeSecondBounceRate: percentage(targets.maxThreeSecondBounceRate, 'targets.maxThreeSecondBounceRate'),
        minActionAverageWatchRatio: percentage(targets.minActionAverageWatchRatio, 'targets.minActionAverageWatchRatio'),
        minConflictAverageWatchRatio: percentage(targets.minConflictAverageWatchRatio, 'targets.minConflictAverageWatchRatio'),
        minVisibleInteractionRate: percentage(targets.minVisibleInteractionRate, 'targets.minVisibleInteractionRate'),
        minimumVideosMeetingRetentionAndInteraction: positiveInteger(
          targets.minimumVideosMeetingRetentionAndInteraction,
          'targets.minimumVideosMeetingRetentionAndInteraction',
        ),
        followerConversionRule: requiredText(targets.followerConversionRule, 'targets.followerConversionRule'),
      },
      decisionRule: requiredText(measurement.decisionRule, 'measurement.decisionRule'),
      stopRule: requiredText(measurement.stopRule, 'measurement.stopRule'),
      reviewPath,
    },
  };
}

export function parseAudienceSampleWorkflow(input: unknown): AudienceSampleWorkflow {
  if (!input || typeof input !== 'object') throw new Error('受众样片流程配置必须是对象。');
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== 1) throw new Error('受众样片流程只支持 schemaVersion=1。');

  const rawStages = Array.isArray(value.stages) ? value.stages : [];
  const stages = rawStages.map((stage, index) => {
    if (!stage || typeof stage !== 'object') throw new Error(`流程阶段 ${index + 1} 无效。`);
    const item = stage as Record<string, unknown>;
    return {
      id: requiredText(item.id, `stages[${index}].id`),
      label: requiredText(item.label, `stages[${index}].label`),
      gate: typeof item.gate === 'string' ? item.gate.trim() : '',
      description: requiredText(item.description, `stages[${index}].description`),
    };
  });
  if (stages.length < 2) throw new Error('受众样片流程至少需要两个阶段。');
  uniqueValues(stages.map((stage) => stage.id), '阶段 id');

  const rawSamples = Array.isArray(value.samples) ? value.samples : [];
  const samples = rawSamples.map((sample, index) => {
    if (!sample || typeof sample !== 'object') throw new Error(`参考样片 ${index + 1} 无效。`);
    const item = sample as Record<string, unknown>;
    const topicScore = Number(item.topicScore);
    const topicScoreMax = Number(item.topicScoreMax);
    if (!Number.isFinite(topicScore) || !Number.isFinite(topicScoreMax) || topicScore < 0 || topicScoreMax <= 0 || topicScore > topicScoreMax) {
      throw new Error(`参考样片 ${index + 1} 的 Topic Gate 评分无效。`);
    }
    return {
      projectId: requiredText(item.projectId, `samples[${index}].projectId`),
      topicScore,
      topicScoreMax,
      role: requiredText(item.role, `samples[${index}].role`),
      learning: requiredText(item.learning, `samples[${index}].learning`),
    };
  });
  if (samples.length === 0) throw new Error('受众样片流程至少需要一个参考项目。');
  uniqueValues(samples.map((sample) => sample.projectId), '参考项目 id');

  const kickoffPromptPath = requiredText(value.kickoffPromptPath, 'kickoffPromptPath');
  const playbookPath = requiredText(value.playbookPath, 'playbookPath');
  const styleExperimentPath = requiredText(value.styleExperimentPath, 'styleExperimentPath');
  const performanceReviewPath = requiredText(value.performanceReviewPath, 'performanceReviewPath');
  if (!kickoffPromptPath.startsWith('content/workflows/')) {
    throw new Error('启动提示词必须位于 content/workflows/。');
  }
  if (!playbookPath.startsWith('docs/')) {
    throw new Error('生产手册必须位于 docs/。');
  }
  if (!styleExperimentPath.startsWith('content/workflows/')) {
    throw new Error('风格实验必须位于 content/workflows/。');
  }
  if (!performanceReviewPath.startsWith('docs/')) {
    throw new Error('表现复盘必须位于 docs/。');
  }

  return {
    schemaVersion: 1,
    id: requiredText(value.id, 'id'),
    label: requiredText(value.label, 'label'),
    title: requiredText(value.title, 'title'),
    direction: requiredText(value.direction, 'direction'),
    kickoffPromptPath,
    playbookPath,
    styleExperimentPath,
    performanceReviewPath,
    stages,
    samples,
  };
}

export const audienceSampleWorkflow = parseAudienceSampleWorkflow(workflowJson);
