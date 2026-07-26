import type {
  MarketEvidence,
  ShortVideoProject,
  WorkflowApproval,
} from './shortVideoBrief';
import { z } from 'zod';
import {
  approvalIsCurrent,
  materialGateReadiness,
  normalizeHumanWorkflowDecision,
  researchApprovalFingerprint as researchApprovalFingerprintContract,
  researchGateReadiness as researchGateReadinessContract,
  topicApprovalFingerprint,
} from '../scripts/lib/production-workflow-contract.mjs';
import { sceneSelectionReadiness } from './productionReadiness';

export interface WorkflowRuntimeEvidence {
  renderState: 'missing' | 'stale' | 'unverified' | 'awaiting_semantic' | 'awaiting_browser' | 'review_failed' | 'ready';
  acceptancePassed: boolean;
  packageReady: boolean;
  videoSha256: string;
  packageSha256: string;
}

const humanDecisionFields = {
  decidedBy: z.string().trim().min(1).max(120),
  note: z.string().trim().min(1).max(2_000),
};

const marketEvidenceSchema = z.object({
  source: z.string().trim().min(1).max(200),
  sourceUrl: z.string().trim().max(2_048),
  metric: z.string().trim().min(1).max(200),
  value: z.number().finite(),
  unit: z.string().trim().min(1).max(80),
  periodStart: z.string().trim().max(64),
  periodEnd: z.string().trim().max(64),
  note: z.string().trim().max(2_000),
}).strict();

export const ProductionWorkflowActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('approve_topic'), ...humanDecisionFields }).strict(),
  z.object({ type: z.literal('reject_topic'), ...humanDecisionFields }).strict(),
  z.object({ type: z.literal('approve_research'), ...humanDecisionFields }).strict(),
  z.object({ type: z.literal('reject_research'), ...humanDecisionFields }).strict(),
  z.object({ type: z.literal('approve_delivery'), ...humanDecisionFields }).strict(),
  z.object({ type: z.literal('reject_delivery'), ...humanDecisionFields }).strict(),
  z.object({
    type: z.literal('approve_publication'),
    ...humanDecisionFields,
    platform: z.string().trim().min(1).max(120),
  }).strict(),
  z.object({ type: z.literal('reject_publication'), ...humanDecisionFields }).strict(),
  z.object({
    type: z.literal('record_publication'),
    publishedUrl: z.string().trim().min(1).max(2_048),
    publishedAt: z.string().trim().min(1).max(64),
  }).strict(),
  z.object({ type: z.literal('record_market_evidence'), evidence: marketEvidenceSchema }).strict(),
  z.object({
    type: z.literal('decide_market'),
    ...humanDecisionFields,
    decision: z.enum(['validated', 'not_validated', 'inconclusive']),
  }).strict(),
]);

export type ProductionWorkflowAction = z.infer<typeof ProductionWorkflowActionSchema>;

export function parseProductionWorkflowAction(value: unknown): ProductionWorkflowAction {
  const parsed = ProductionWorkflowActionSchema.safeParse(value);
  if (!parsed.success) throw new Error('生产流程操作参数无效。');
  return parsed.data;
}

export interface WorkflowStage {
  id: 'topic' | 'materials' | 'research' | 'narrative' | 'shots' | 'technical' | 'acceptance' | 'package' | 'publication' | 'market';
  label: string;
  status: 'waiting' | 'ready' | 'approved' | 'blocked' | 'completed';
  message: string;
  responsibility: 'automatic' | 'operator_review' | 'human_gate';
}

export type ProductionWorkflowAutomaticAction = 'process_sources' | 'plan_project' | 'render' | 'package';

export interface ProductionWorkflowAutomaticFailure {
  action: Exclude<ProductionWorkflowAutomaticAction, 'package'>;
  message: string;
  failedAt: string;
}

export function researchApprovalFingerprint(project: ShortVideoProject) {
  return researchApprovalFingerprintContract(project);
}

export function researchGateReadiness(project: ShortVideoProject) {
  return researchGateReadinessContract(project);
}

function decision(status: 'approved' | 'rejected', decidedBy: string, note: string, fingerprint: string, now: string) {
  const human = normalizeHumanWorkflowDecision(decidedBy, note);
  return {
    status,
    decidedAt: now,
    decidedBy: human.actor,
    note: human.note,
    fingerprint,
  } satisfies WorkflowApproval;
}

function validPublicationUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function applyProductionWorkflowAction(
  project: ShortVideoProject,
  runtime: WorkflowRuntimeEvidence,
  action: ProductionWorkflowAction,
  now = new Date().toISOString(),
) {
  const next = structuredClone(project);
  const topicFingerprint = topicApprovalFingerprint(project);
  const research = researchGateReadiness(project);

  if (action.type === 'approve_topic' || action.type === 'reject_topic') {
    next.workflow.topicApproval = decision(
      action.type === 'approve_topic' ? 'approved' : 'rejected',
      action.decidedBy,
      action.note,
      topicFingerprint,
      now,
    );
    return next;
  }

  if (!approvalIsCurrent(project.workflow.topicApproval, topicFingerprint)) {
    throw new Error('必须先通过最终命题 Gate。');
  }

  if (action.type === 'approve_research') {
    if (!research.ready) throw new Error(`研究 Gate 未就绪：${research.issues.join('；')}`);
    next.workflow.researchApproval = decision('approved', action.decidedBy, action.note, research.fingerprint, now);
    return next;
  }
  if (action.type === 'reject_research') {
    next.workflow.researchApproval = decision('rejected', action.decidedBy, action.note, research.fingerprint, now);
    return next;
  }

  if (!approvalIsCurrent(project.workflow.researchApproval, research.fingerprint)) {
    throw new Error('关键事实或研究输入尚未通过当前版本的人工 Gate。');
  }

  if (action.type === 'approve_delivery') {
    if (!runtime.acceptancePassed || runtime.renderState !== 'ready' || !runtime.videoSha256) {
      throw new Error('成片尚未完成技术、语义和桌面/移动浏览器验收。');
    }
    next.workflow.deliveryApproval = decision('approved', action.decidedBy, action.note, runtime.videoSha256, now);
    return next;
  }
  if (action.type === 'reject_delivery') {
    next.workflow.deliveryApproval = decision('rejected', action.decidedBy, action.note, runtime.videoSha256, now);
    return next;
  }

  if (!approvalIsCurrent(project.workflow.deliveryApproval, runtime.videoSha256)) {
    throw new Error('当前视频字节尚未通过真人完整审片 Gate。');
  }

  if (action.type === 'approve_publication') {
    if (project.rights_status !== 'cleared') throw new Error('素材权利尚未全部 cleared，不能批准发布。');
    if (!runtime.packageReady || !runtime.packageSha256) throw new Error('当前版本的 production package 尚未生成或已过期。');
    if (!action.platform.trim()) throw new Error('必须记录目标发布平台。');
    const binding = `${runtime.videoSha256}:${runtime.packageSha256}`;
    next.workflow.publication.approval = decision('approved', action.decidedBy, action.note, binding, now);
    next.workflow.publication.platform = action.platform.trim();
    next.workflow.publication.videoSha256 = runtime.videoSha256;
    next.workflow.publication.packageSha256 = runtime.packageSha256;
    next.publication_status = 'ready-for-review';
    return next;
  }
  if (action.type === 'reject_publication') {
    next.workflow.publication.approval = decision(
      'rejected', action.decidedBy, action.note, `${runtime.videoSha256}:${runtime.packageSha256}`, now,
    );
    next.publication_status = 'draft-unpublished';
    return next;
  }

  const publicationBinding = `${runtime.videoSha256}:${runtime.packageSha256}`;
  if (!approvalIsCurrent(project.workflow.publication.approval, publicationBinding)) {
    throw new Error('当前 production package 尚未获得人工发布批准。');
  }

  if (action.type === 'record_publication') {
    if (!validPublicationUrl(action.publishedUrl)) throw new Error('必须记录真实的 http(s) 发布 URL。');
    if (!Number.isFinite(Date.parse(action.publishedAt))) throw new Error('发布时间无效。');
    next.workflow.publication.publishedUrl = action.publishedUrl;
    next.workflow.publication.publishedAt = action.publishedAt;
    next.publication_status = 'published';
    next.status = 'published';
    next.market_status = 'collecting';
    return next;
  }

  if (project.publication_status !== 'published' || !project.workflow.publication.publishedUrl) {
    throw new Error('只有记录真实发布 URL 后才能收集市场反馈。');
  }

  if (action.type === 'record_market_evidence') {
    const item = action.evidence;
    if (!item.source.trim() || !item.metric.trim() || !item.unit.trim()) {
      throw new Error('市场证据必须包含来源、指标和单位。');
    }
    if (!Number.isFinite(item.value)) throw new Error('市场证据数值无效。');
    if (item.sourceUrl && !validPublicationUrl(item.sourceUrl)) throw new Error('市场证据 URL 无效。');
    const periodStart = item.periodStart ? Date.parse(item.periodStart) : null;
    const periodEnd = item.periodEnd ? Date.parse(item.periodEnd) : null;
    if ((periodStart === null) !== (periodEnd === null)) {
      throw new Error('市场证据统计周期必须同时包含开始和结束时间。');
    }
    if ((periodStart !== null && !Number.isFinite(periodStart))
      || (periodEnd !== null && !Number.isFinite(periodEnd))) {
      throw new Error('市场证据统计周期无效。');
    }
    if (periodStart !== null && periodEnd !== null && periodEnd < periodStart) {
      throw new Error('市场证据统计周期结束时间不能早于开始时间。');
    }
    next.workflow.market.evidence.push({
      ...item,
      id: `market-evidence-${String(next.workflow.market.evidence.length + 1).padStart(3, '0')}`,
      recordedAt: now,
    });
    next.market_status = 'collecting';
    return next;
  }

  if (action.type !== 'decide_market') {
    throw new Error('不支持的生产流程操作。');
  }
  if (project.workflow.market.evidence.length === 0) {
    throw new Error('没有真实市场证据，不能形成市场验证结论。');
  }
  const human = normalizeHumanWorkflowDecision(action.decidedBy, action.note);
  next.workflow.market.decision = action.decision;
  next.workflow.market.decidedAt = now;
  next.workflow.market.decidedBy = human.actor;
  next.workflow.market.note = human.note;
  next.market_status = action.decision;
  return next;
}

export function productionWorkflowSnapshot(
  project: ShortVideoProject,
  runtime: WorkflowRuntimeEvidence,
) {
  const research = researchGateReadiness(project);
  const topicApproved = approvalIsCurrent(project.workflow.topicApproval, topicApprovalFingerprint(project));
  const material = materialGateReadiness(project);
  const materialsApproved = material.ready;
  const researchApproved = approvalIsCurrent(project.workflow.researchApproval, research.fingerprint);
  const narrativeReady = Boolean(project.narrative.activeVersionId && project.scenes.length > 0);
  const shotReadiness = sceneSelectionReadiness(project.scenes, project.materialReview.approvedSourceIds);
  const shotsReady = project.scenes.some((scene) => scene.enabled) && shotReadiness.ready;
  const technicalReady = project.technical_status === 'passed'
    && !['missing', 'stale', 'unverified'].includes(runtime.renderState);
  const deliveryApproved = approvalIsCurrent(project.workflow.deliveryApproval, runtime.videoSha256);
  const publicationBinding = `${runtime.videoSha256}:${runtime.packageSha256}`;
  const publicationApproved = approvalIsCurrent(project.workflow.publication.approval, publicationBinding);
  const publicationReady = deliveryApproved && runtime.packageReady;
  const publicationBlockedByRights = publicationReady && project.rights_status !== 'cleared';

  const stages: WorkflowStage[] = [
    { id: 'topic', label: '最终命题', status: topicApproved ? 'approved' : 'waiting', message: topicApproved ? '命题已由用户明确批准。' : '等待用户批准最终命题。', responsibility: 'human_gate' },
    { id: 'materials', label: '素材与权利边界', status: project.rights_status === 'blocked' ? 'blocked' : materialsApproved ? 'approved' : 'waiting', message: materialsApproved ? '素材包已复核，权利状态单独保留。' : material.issues.join('；') || '等待 Codex 或用户确认可用于本轮制作的素材包。', responsibility: 'operator_review' },
    { id: 'research', label: '关键事实与风险', status: researchApproved ? 'approved' : research.ready ? 'ready' : 'waiting', message: researchApproved ? '当前研究版本已获人工批准。' : research.issues.join('；') || '等待人工确认研究结论。', responsibility: 'human_gate' },
    { id: 'narrative', label: '叙事与脚本', status: narrativeReady ? 'completed' : researchApproved ? 'ready' : 'waiting', message: narrativeReady ? 'canonical project 已有生效叙事和场景。' : '等待自动生成或应用叙事。', responsibility: 'automatic' },
    { id: 'shots', label: '镜头语义绑定', status: shotsReady ? 'approved' : narrativeReady ? 'ready' : 'waiting', message: shotsReady ? '所有启用场景均绑定已复核候选。' : shotReadiness.reason || '等待 Codex 或用户逐幕复核候选。', responsibility: 'operator_review' },
    { id: 'technical', label: '渲染与技术验收', status: technicalReady ? 'completed' : shotsReady ? 'ready' : 'waiting', message: technicalReady ? '当前生产内容通过 technical proof。' : '等待 FFmpeg 渲染和技术 proof。', responsibility: 'automatic' },
    { id: 'acceptance', label: '成片验收', status: deliveryApproved ? 'approved' : runtime.acceptancePassed ? 'ready' : runtime.renderState === 'review_failed' ? 'blocked' : 'waiting', message: deliveryApproved ? '当前视频字节已获真人交付批准。' : runtime.acceptancePassed ? '自动验收完成，等待真人一倍速审片。' : '等待语义、编辑质量和浏览器验收。', responsibility: 'human_gate' },
    { id: 'package', label: 'Production package', status: runtime.packageReady ? 'completed' : deliveryApproved ? 'ready' : 'waiting', message: runtime.packageReady ? '当前版本 ZIP 与收据有效。' : deliveryApproved ? '等待生成当前版本的完整导出包。' : '等待真人批准当前成片后再打包。', responsibility: 'automatic' },
    { id: 'publication', label: '发布', status: project.publication_status === 'published' ? 'completed' : publicationApproved ? 'approved' : publicationBlockedByRights ? 'blocked' : publicationReady ? 'ready' : 'waiting', message: project.publication_status === 'published' ? '真实发布 URL 已记录。' : publicationApproved ? '已批准人工发布，等待记录真实 URL。' : publicationBlockedByRights ? `rights_status=${project.rights_status}，不能批准发布。` : '发布不会自动执行。', responsibility: 'human_gate' },
    { id: 'market', label: '市场反馈', status: project.workflow.market.decision !== 'pending' ? 'completed' : project.workflow.market.evidence.length > 0 ? 'ready' : project.publication_status === 'published' ? 'waiting' : 'waiting', message: project.workflow.market.decision !== 'pending' ? `人工结论：${project.workflow.market.decision}` : project.workflow.market.evidence.length > 0 ? '已有真实证据，等待人工形成结论。' : '发布后才能收集真实市场证据。', responsibility: 'human_gate' },
  ];
  const next = stages.find((stage) => !['approved', 'completed'].includes(stage.status)) ?? null;
  return { stages, next, research, runtime, automaticAction: nextProductionWorkflowAutomaticAction(project, runtime) };
}

export function nextProductionWorkflowAutomaticAction(
  project: ShortVideoProject,
  runtime: WorkflowRuntimeEvidence,
): ProductionWorkflowAutomaticAction | null {
  const topicApproved = approvalIsCurrent(
    project.workflow.topicApproval,
    topicApprovalFingerprint(project),
  );
  if (!topicApproved) return null;
  if (project.sources.some((source) => ['idle', 'pending', 'running'].includes(source.processing.status))) {
    return 'process_sources';
  }
  if (!materialGateReadiness(project).ready) return null;

  const research = researchGateReadiness(project);
  if (!approvalIsCurrent(project.workflow.researchApproval, research.fingerprint)) return null;
  if (!project.narrative.activeVersionId || project.scenes.length === 0) return 'plan_project';

  const shots = sceneSelectionReadiness(project.scenes, project.materialReview.approvedSourceIds);
  if (!shots.ready) return null;
  const technicalReady = project.technical_status === 'passed'
    && !['missing', 'stale', 'unverified'].includes(runtime.renderState);
  if (!technicalReady) return 'render';
  if (!runtime.acceptancePassed) return null;
  if (!approvalIsCurrent(project.workflow.deliveryApproval, runtime.videoSha256)) return null;
  if (!runtime.packageReady) return 'package';
  return null;
}
