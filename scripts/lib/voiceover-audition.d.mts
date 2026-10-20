export interface AuditionVoice {
  engine: string;
  model: string;
  voice: string;
  rate: number;
  profile: string;
  style: string;
  effectiveStyle: string;
  effectiveRate: number | null;
  rateControl: string;
  pronunciations: Array<{ term: string; guidance: string; spokenText?: string }>;
}
export interface AuditionVariant {
  id: string;
  label: string;
  text: string;
  textSha256: string;
  cacheKey: string;
  voice?: AuditionVoice;
  audioPath?: string;
  durationSeconds?: number;
  cacheSource?: 'existing-voice-cache' | 'audition-cache' | 'provider';
}
export interface AuditionPlan {
  status: string;
  projectId: string;
  cwd: string;
  workDir: string;
  voice: AuditionVoice;
  variants: AuditionVariant[];
  [key: string]: unknown;
}
export function buildVoiceoverAuditionPlan(project: unknown, candidate: unknown, options?: { cwd?: string; briefPath?: string; workDir?: string }): AuditionPlan;
export function measureVoiceoverDuration(path: string): Promise<number>;
export function runVoiceoverAudition(plan: AuditionPlan, options?: { render?: boolean; synthesize?: (...args: any[]) => Promise<any>; measureDuration?: (path: string) => Promise<number> }): Promise<AuditionPlan>;
