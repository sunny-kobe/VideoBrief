export interface SubtitleSilenceInterval {
  start: number;
  end: number;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
  alignment: 'silence-assisted' | 'character-weighted';
}

export function planSubtitleCues(input: {
  phrases: string[];
  speechDuration: number;
  silences?: SubtitleSilenceInterval[];
}): SubtitleCue[];
