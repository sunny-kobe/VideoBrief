import type { ShortVideoProject } from '../../src/shortVideoBrief';

export interface VoiceoverPreflightReport {
  schemaVersion: number;
  status: 'passed' | 'failed';
  generatedAt: string;
  projectId: string;
  fingerprint: string;
  attempts: Array<Record<string, unknown>>;
  issues: string[];
  scenes: Array<Record<string, unknown>>;
  voiceover: Record<string, unknown>;
  [key: string]: unknown;
}

export function readVoiceoverPreflight(path: string): VoiceoverPreflightReport | null;
export function voiceoverPreflightFingerprint(input: Record<string, unknown>): string;
export function appendVoiceoverPreflightAttempt(previous: unknown, fingerprint: string, attempt: Record<string, unknown>): Array<Record<string, unknown>>;
export function buildVoiceoverPreflightReport(input: Record<string, unknown>): VoiceoverPreflightReport;
export function buildFailedVoiceoverPreflightReport(input: Record<string, unknown>): VoiceoverPreflightReport;
export function voiceoverPreflightReadiness(input: {
  project: ShortVideoProject;
  report: VoiceoverPreflightReport | null;
  voiceConfig: Record<string, unknown>;
  voiceGenerationMode: string;
  rendition: Record<string, unknown>;
}): { ready: boolean; issues: string[]; sceneCount: number; fingerprint?: string };
export function assertCurrentVoiceoverPreflight(input: Parameters<typeof voiceoverPreflightReadiness>[0]): ReturnType<typeof voiceoverPreflightReadiness>;
