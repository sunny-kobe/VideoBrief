import type { ShortVideoProject, WorkflowApproval } from '../../src/shortVideoBrief';
import type { materialQualityGateReadiness } from './material-quality-gate.mjs';

export const MINIMUM_WORKFLOW_DECISION_NOTE_LENGTH: number;
export function topicApprovalFingerprint(project: ShortVideoProject): string;
export function researchApprovalFingerprint(project: ShortVideoProject): string;
export function approvalIsCurrent(approval: WorkflowApproval | undefined, fingerprint: string): boolean;
export function normalizeHumanWorkflowDecision(decidedBy: string, note: string, options?: { noteRequired?: boolean }): {
  actor: string;
  note: string;
};
export function materialGateReadiness(project: ShortVideoProject): {
  ready: boolean;
  issues: string[];
  approvedSources: ShortVideoProject['sources'];
};
export function researchGateReadiness(project: ShortVideoProject): {
  ready: boolean;
  issues: string[];
  fingerprint: string;
  confirmedFactCount: number;
};
export function preproductionGateReadiness(project: ShortVideoProject): {
  ready: boolean;
  issues: string[];
  topicFingerprint: string;
  research: ReturnType<typeof researchGateReadiness>;
  material: ReturnType<typeof materialGateReadiness>;
  materialQuality: ReturnType<typeof materialQualityGateReadiness>;
};
export function voiceoverPreflightGateReadiness(project: ShortVideoProject): {
  ready: boolean;
  issues: string[];
  topicFingerprint: string;
  research: ReturnType<typeof researchGateReadiness>;
  material: ReturnType<typeof materialGateReadiness>;
};
export function assertPreproductionGates(project: ShortVideoProject): ReturnType<typeof preproductionGateReadiness>;
export function assertVoiceoverPreflightGates(project: ShortVideoProject): ReturnType<typeof voiceoverPreflightGateReadiness>;
export function assertDeliveryApproved(project: ShortVideoProject, videoSha256: string): void;
