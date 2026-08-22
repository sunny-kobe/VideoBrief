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

export interface AudienceSampleStyleExperiment {
  schemaVersion: 1;
  id: string;
  label: string;
  status: 'active' | 'completed';
  startedAt: string;
  reviewAfterPublishedVideos: number;
  reviewDeadline: string;
  hypothesis: string;
  productionDefaults: {
    minDurationSeconds: number;
    maxDurationSeconds: number;
    opening: string;
    answerPreview: string;
    explanation: string;
    closing: string;
    decisionTopicsPerCycle: number;
    mechanismTopicsPerCycle: number;
    cover: string;
    visualRules: string[];
  };
  measurement: {
    snapshotHours: number[];
    requiredMetrics: string[];
    decisionRule: string;
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
  if (value.schemaVersion !== 1) throw new Error('风格实验只支持 schemaVersion=1。');
  if (value.status !== 'active' && value.status !== 'completed') {
    throw new Error('风格实验状态必须是 active 或 completed。');
  }

  const defaults = value.productionDefaults as Record<string, unknown> | undefined;
  if (!defaults) throw new Error('风格实验缺少 productionDefaults。');
  const minDurationSeconds = positiveInteger(defaults.minDurationSeconds, 'minDurationSeconds');
  const maxDurationSeconds = positiveInteger(defaults.maxDurationSeconds, 'maxDurationSeconds');
  if (maxDurationSeconds < minDurationSeconds) throw new Error('风格实验的时长上限不能小于下限。');

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

  return {
    schemaVersion: 1,
    id: requiredText(value.id, 'id'),
    label: requiredText(value.label, 'label'),
    status: value.status,
    startedAt: requiredText(value.startedAt, 'startedAt'),
    reviewAfterPublishedVideos: positiveInteger(
      value.reviewAfterPublishedVideos,
      'reviewAfterPublishedVideos',
    ),
    reviewDeadline: requiredText(value.reviewDeadline, 'reviewDeadline'),
    hypothesis: requiredText(value.hypothesis, 'hypothesis'),
    productionDefaults: {
      minDurationSeconds,
      maxDurationSeconds,
      opening: requiredText(defaults.opening, 'productionDefaults.opening'),
      answerPreview: requiredText(defaults.answerPreview, 'productionDefaults.answerPreview'),
      explanation: requiredText(defaults.explanation, 'productionDefaults.explanation'),
      closing: requiredText(defaults.closing, 'productionDefaults.closing'),
      decisionTopicsPerCycle: positiveInteger(
        defaults.decisionTopicsPerCycle,
        'productionDefaults.decisionTopicsPerCycle',
      ),
      mechanismTopicsPerCycle: positiveInteger(
        defaults.mechanismTopicsPerCycle,
        'productionDefaults.mechanismTopicsPerCycle',
      ),
      cover: requiredText(defaults.cover, 'productionDefaults.cover'),
      visualRules: requiredTextList(defaults.visualRules, 'productionDefaults.visualRules'),
    },
    measurement: {
      snapshotHours,
      requiredMetrics: requiredTextList(measurement.requiredMetrics, 'measurement.requiredMetrics'),
      decisionRule: requiredText(measurement.decisionRule, 'measurement.decisionRule'),
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
