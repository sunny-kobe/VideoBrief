export interface VoiceoverBatchScene {
  id: string;
  chapterId?: string;
  [key: string]: unknown;
}

export interface VoiceoverBatchChapter {
  id: string;
  order?: number;
  [key: string]: unknown;
}

export interface VoiceoverBatchEntry<TScene extends VoiceoverBatchScene = VoiceoverBatchScene> {
  scene: TScene;
  index: number;
}

export interface VoiceoverBatch<TScene extends VoiceoverBatchScene = VoiceoverBatchScene> {
  id: string;
  chapterId: string;
  entries: VoiceoverBatchEntry<TScene>[];
}

export function planVoiceoverBatches<TScene extends VoiceoverBatchScene>(
  scenes: TScene[],
  chapters: VoiceoverBatchChapter[],
  targetDurationSeconds: number,
): VoiceoverBatch<TScene>[];
