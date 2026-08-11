import type {
  ShortVideoProject,
  WorkbenchRenderStatus,
  WorkflowApproval,
} from './shortVideoBrief';
import type {
  ProductionWorkflowAutomaticFailure,
  WorkflowStage,
} from './productionWorkflow';
import { z } from 'zod';

export const ProjectLifecycleActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('archive'),
    archivedBy: z.string().trim().min(1).max(120),
    archiveReason: z.string().trim().max(1_000).default(''),
  }).strict(),
  z.object({
    action: z.literal('restore'),
    restoredBy: z.string().trim().min(1).max(120),
  }).strict(),
]);

export const ProjectDeletionConfirmationSchema = z.object({
  confirmation: z.string().trim().min(1).max(160),
}).strict();

export type ProjectLifecycleAction = z.infer<typeof ProjectLifecycleActionSchema>;

export type ProjectDisplayStage =
  | 'needs_attention'
  | 'in_progress'
  | 'awaiting_review'
  | 'completed'
  | 'archived';

export const projectDisplayStageLabel: Record<ProjectDisplayStage, string> = {
  needs_attention: '需处理',
  in_progress: '制作中',
  awaiting_review: '待审片',
  completed: '已完成',
  archived: '已归档',
};

export interface ProjectQueueEvidence {
  kind: 'source-processing' | 'project-planning' | 'render';
  state: 'queued' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed' | 'awaiting_review';
  error?: string;
}

export interface ProjectDisplayStageInput {
  project: ShortVideoProject;
  render: Pick<WorkbenchRenderStatus, 'state' | 'label' | 'message'>;
  workflowStages: WorkflowStage[];
  workflowFailure: ProductionWorkflowAutomaticFailure | null;
  queues: ProjectQueueEvidence[];
}

export interface ProjectDisplayDecision {
  stage: ProjectDisplayStage;
  issue: string;
  nextAction: string;
  nextWorkflowStage: WorkflowStage['id'] | null;
}

const activeQueueStates = new Set(['queued', 'running', 'cancelling']);

function rejectedApproval(project: ShortVideoProject) {
  const approvals: Array<[string, WorkflowApproval]> = [
    ['命题 Gate', project.workflow.topicApproval],
    ['研究 Gate', project.workflow.researchApproval],
    ['Delivery Gate', project.workflow.deliveryApproval],
    ['发布 Gate', project.workflow.publication.approval],
  ];
  return approvals.find(([, approval]) => approval.status === 'rejected') ?? null;
}

function nextIncompleteStage(stages: WorkflowStage[]) {
  return stages.find((stage) => !['approved', 'completed'].includes(stage.status)) ?? null;
}

/**
 * 首页阶段优先级：归档 > 错误/阻塞/拒绝 > 活跃队列 > 待审片 > 已完成 > 需处理。
 * 它只帮助检索和决策，不写回 canonical project。
 */
export function deriveProjectDisplayStage(input: ProjectDisplayStageInput): ProjectDisplayDecision {
  const { project, render, workflowStages, workflowFailure, queues } = input;
  const next = nextIncompleteStage(workflowStages);

  if (project.lifecycle?.state === 'archived') {
    return { stage: 'archived', issue: '', nextAction: '查看归档项目', nextWorkflowStage: next?.id ?? null };
  }

  const rejected = rejectedApproval(project);
  const blockedStage = workflowStages.find((stage) => stage.status === 'blocked');
  const failedQueue = queues.find((queue) => queue.state === 'failed');
  const failedSource = project.sources.find((source) => source.processing.status === 'failed');
  const hardIssue = workflowFailure?.message
    || (project.rights_status === 'blocked' ? '存在禁止使用的素材。' : '')
    || (project.technical_status === 'failed' ? project.production.lastRenderError || '技术验收失败。' : '')
    || (render.state === 'review_failed' ? render.message : '')
    || (rejected ? `${rejected[0]} 已拒绝：${rejected[1].note || '需要重新决策。'}` : '')
    || blockedStage?.message
    || failedQueue?.error
    || (failedSource ? `${failedSource.label} 处理失败：${failedSource.processing.error || '需要重试。'}` : '');

  if (hardIssue) {
    return {
      stage: 'needs_attention',
      issue: hardIssue,
      nextAction: next?.responsibility === 'automatic' ? '继续制作' : '处理问题',
      nextWorkflowStage: next?.id ?? null,
    };
  }

  if (queues.some((queue) => activeQueueStates.has(queue.state))) {
    return { stage: 'in_progress', issue: '', nextAction: '查看进度', nextWorkflowStage: next?.id ?? null };
  }

  const acceptance = workflowStages.find((stage) => stage.id === 'acceptance');
  const acceptanceIndex = workflowStages.findIndex((stage) => stage.id === 'acceptance');
  const unfinishedBeforeAcceptance = acceptanceIndex < 0
    ? null
    : workflowStages.slice(0, acceptanceIndex)
      .find((stage) => !['approved', 'completed'].includes(stage.status)) ?? null;
  if (!unfinishedBeforeAcceptance && acceptance?.status === 'ready' && render.state === 'ready') {
    return { stage: 'awaiting_review', issue: '', nextAction: '开始审片', nextWorkflowStage: 'acceptance' };
  }
  if (!unfinishedBeforeAcceptance && acceptance?.status === 'approved' && render.state === 'ready') {
    return { stage: 'completed', issue: '', nextAction: '查看成片', nextWorkflowStage: null };
  }

  return {
    stage: 'needs_attention',
    issue: next?.message || render.message || '当前没有自动任务，等待继续处理。',
    nextAction: next?.responsibility === 'automatic' ? '继续制作' : '前往处理',
    nextWorkflowStage: next?.id ?? null,
  };
}

export function projectNextHref(projectId: string, decision: ProjectDisplayDecision) {
  const base = `/workbench?project=${encodeURIComponent(projectId)}`;
  if (decision.stage === 'awaiting_review' || decision.stage === 'completed' || decision.stage === 'in_progress' || decision.stage === 'archived') {
    return base;
  }
  const viewByStage: Partial<Record<WorkflowStage['id'], string>> = {
    topic: 'sources',
    materials: 'sources',
    research: 'sources',
    narrative: 'planning',
    shots: 'clips',
    technical: 'export',
    package: 'export',
  };
  const view = decision.nextWorkflowStage ? viewByStage[decision.nextWorkflowStage] : undefined;
  return view ? `${base}&advanced=1&view=${view}` : base;
}
