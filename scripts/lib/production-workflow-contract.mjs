import { createHash } from 'node:crypto';
import { materialQualityGateReadiness } from './material-quality-gate.mjs';

export const MINIMUM_WORKFLOW_DECISION_NOTE_LENGTH = 12;

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function topicApprovalFingerprint(project) {
  return hash({
    id: project.id,
    title: project.title,
    brief: project.brief,
    origin: project.workflow?.origin ?? null,
  });
}

function researchEvidenceSources(project) {
  const sources = project.sources ?? [];
  const explicitResearchSources = sources.filter((source) => source.materialRole === 'research');
  if (explicitResearchSources.length > 0) return explicitResearchSources;

  const referencedIds = new Set([
    ...(project.research?.transcripts ?? []).map((segment) => segment.sourceId),
    ...(project.research?.facts ?? []).flatMap((fact) => (
      fact.kind === 'claim' ? (fact.sourceReferences ?? []).map((reference) => reference.sourceId) : []
    )),
    ...(project.research?.uncertainties ?? []).flatMap((item) => (
      (item.sourceReferences ?? []).map((reference) => reference.sourceId)
    )),
  ]);
  return sources.filter((source) => referencedIds.has(source.id));
}

export function researchApprovalFingerprint(project) {
  const sources = researchEvidenceSources(project);
  const sourceIds = new Set(sources.map((source) => source.id));
  return hash({
    brief: project.brief,
    sources: sources.map((source) => ({
      id: source.id,
      contentHash: source.contentHash,
      processingStatus: source.processing?.status,
      facts: source.analysis?.facts ?? [],
      uncertainties: source.analysis?.uncertainties ?? [],
    })),
    research: {
      transcripts: (project.research?.transcripts ?? []).filter((segment) => sourceIds.has(segment.sourceId)),
      facts: (project.research?.facts ?? []).filter((fact) => (
        (fact.sourceReferences ?? []).some((reference) => sourceIds.has(reference.sourceId))
      )),
      uncertainties: (project.research?.uncertainties ?? []).filter((item) => (
        (item.sourceReferences ?? []).some((reference) => sourceIds.has(reference.sourceId))
      )),
    },
  });
}

export function approvalIsCurrent(approval, fingerprint) {
  return approval?.status === 'approved' && approval.fingerprint === fingerprint;
}

export function normalizeHumanWorkflowDecision(decidedBy, note, options = {}) {
  const actor = String(decidedBy ?? '').trim();
  const normalizedNote = String(note ?? '').trim();
  if (!actor || ['ai', 'codex', 'system'].includes(actor.toLowerCase())) {
    throw new Error('该 Gate 必须记录真实人工批准者，不能由 AI 或系统代签。');
  }
  if (options.noteRequired !== false && normalizedNote.length < MINIMUM_WORKFLOW_DECISION_NOTE_LENGTH) {
    throw new Error(`人工决策说明至少需要 ${MINIMUM_WORKFLOW_DECISION_NOTE_LENGTH} 个字符。`);
  }
  return { actor, note: normalizedNote };
}

export function materialGateReadiness(project) {
  const issues = [];
  const approvedIds = [...new Set(project.materialReview?.approvedSourceIds ?? [])];
  const sourcesById = new Map((project.sources ?? []).map((source) => [source.id, source]));
  const approvedSources = approvedIds.flatMap((sourceId) => {
    const source = sourcesById.get(sourceId);
    return source ? [source] : [];
  });

  if (project.materialReview?.status !== 'approved' || approvedIds.length === 0) {
    issues.push('素材包尚未明确批准。');
  }
  if (approvedSources.length !== approvedIds.length) {
    issues.push('素材包引用了不存在的来源。');
  }
  if (approvedSources.some((source) => source.materialRole === 'research')) {
    issues.push('素材包包含仅供研究参考的来源。');
  }
  if (!approvedSources.some((source) => source.sourceType === 'video' || source.sourceType === 'image')) {
    issues.push('素材包没有可用于画面的图片或视频。');
  }
  if (approvedSources.some((source) => source.rightsStatus === 'blocked')) {
    issues.push('素材包包含禁止使用的来源。');
  }
  return { ready: issues.length === 0, issues, approvedSources };
}

export function researchGateReadiness(project) {
  const issues = [];
  const sources = researchEvidenceSources(project);
  if (!sources.some((source) => source.processing?.status === 'completed')) {
    issues.push('没有来源完成内容理解。');
  }
  if (sources.some((source) => ['idle', 'pending', 'running'].includes(source.processing?.status))) {
    issues.push('仍有来源等待内容理解。');
  }
  const failedSourceCount = sources.filter((source) => source.processing?.status === 'failed').length;
  if (failedSourceCount > 0) issues.push(`有 ${failedSourceCount} 份来源内容理解失败，需重试或移除。`);

  const claims = (project.research?.facts ?? []).filter((fact) => (
    fact.kind === 'claim' && fact.reviewPriority !== 'reference'
  ));
  const requiredClaims = claims.filter((fact) => fact.reviewPriority === 'required');
  const keyClaims = requiredClaims.length > 0 ? requiredClaims : claims;
  const pendingFacts = keyClaims.filter((fact) => fact.reviewStatus === 'proposed');
  const confirmedFacts = keyClaims.filter((fact) => fact.reviewStatus === 'confirmed');
  if (pendingFacts.length > 0) issues.push(`还有 ${pendingFacts.length} 条关键事实待确认或驳回。`);
  if (confirmedFacts.length === 0) issues.push('至少需要一条已确认的关键事实。');

  const unresolvedRisks = (project.research?.uncertainties ?? []).filter((item) => (
    item.riskLevel === 'high'
    && item.reviewPriority === 'required'
    && !String(item.resolution ?? '').trim()
  ));
  if (unresolvedRisks.length > 0) issues.push(`还有 ${unresolvedRisks.length} 条高风险问题未处理。`);

  return {
    ready: issues.length === 0,
    issues,
    fingerprint: researchApprovalFingerprint(project),
    confirmedFactCount: confirmedFacts.length,
  };
}

export function preproductionGateReadiness(project) {
  const issues = [];
  const topicFingerprint = topicApprovalFingerprint(project);
  if (!approvalIsCurrent(project.workflow?.topicApproval, topicFingerprint)) {
    issues.push('最终命题尚未通过当前版本的人工 Gate。');
  }
  const research = researchGateReadiness(project);
  issues.push(...research.issues);
  if (!approvalIsCurrent(project.workflow?.researchApproval, research.fingerprint)) {
    issues.push('关键事实与研究结论尚未通过当前版本的人工 Gate。');
  }
  const material = materialGateReadiness(project);
  issues.push(...material.issues);
  const materialQuality = materialQualityGateReadiness(project);
  issues.push(...materialQuality.issues);
  return { ready: issues.length === 0, issues, topicFingerprint, research, material, materialQuality };
}

export function assertPreproductionGates(project) {
  const readiness = preproductionGateReadiness(project);
  if (!readiness.ready) {
    throw new Error(`生产前 Gate 未通过：${readiness.issues.join('；')}`);
  }
  return readiness;
}

export function assertDeliveryApproved(project, videoSha256) {
  if (!videoSha256 || !approvalIsCurrent(project.workflow?.deliveryApproval, videoSha256)) {
    throw new Error('当前视频字节尚未通过真人完整审片 Gate。');
  }
}
