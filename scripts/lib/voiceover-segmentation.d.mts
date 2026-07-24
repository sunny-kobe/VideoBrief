export interface SilenceInterval {
  start: number;
  end: number;
  duration: number;
}

export interface VoiceSegmentPlan {
  index: number;
  start: number;
  end: number;
  duration: number;
  leadingBoundary: SilenceInterval | null;
  trailingBoundary: SilenceInterval | null;
}

export function parseSilenceIntervals(output: string): SilenceInterval[];
export function resolveAudibleVoiceWindow(input: {
  silences: SilenceInterval[];
  audioDuration: number;
  edgeTolerance?: number;
  protection?: number;
}): {
  start: number;
  end: number;
  duration: number;
  trimmed: boolean;
};
export function planVoiceSegments(input: {
  silences: SilenceInterval[];
  audioDuration: number;
  segmentCount: number;
  segmentWeights?: number[];
  minimumBoundarySilence?: number;
  edgeTolerance?: number;
  protection?: number;
}): VoiceSegmentPlan[];
