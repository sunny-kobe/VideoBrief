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
  stages: AudienceSampleWorkflowStage[];
  samples: AudienceSampleReference[];
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
  if (!kickoffPromptPath.startsWith('content/workflows/')) {
    throw new Error('启动提示词必须位于 content/workflows/。');
  }
  if (!playbookPath.startsWith('docs/')) {
    throw new Error('生产手册必须位于 docs/。');
  }

  return {
    schemaVersion: 1,
    id: requiredText(value.id, 'id'),
    label: requiredText(value.label, 'label'),
    title: requiredText(value.title, 'title'),
    direction: requiredText(value.direction, 'direction'),
    kickoffPromptPath,
    playbookPath,
    stages,
    samples,
  };
}

export const audienceSampleWorkflow = parseAudienceSampleWorkflow(workflowJson);
