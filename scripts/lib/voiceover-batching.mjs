import { LONG_FORM_THRESHOLD_SECONDS } from './video-duration-contract.mjs';

export function planVoiceoverBatches(scenes, chapters, targetDurationSeconds) {
  const entries = (Array.isArray(scenes) ? scenes : []).map((scene, index) => ({ scene, index }));
  if (Number(targetDurationSeconds) < LONG_FORM_THRESHOLD_SECONDS) {
    return entries.length ? [{ id: 'full-video', chapterId: '', entries }] : [];
  }

  const orderedChapters = [...(Array.isArray(chapters) ? chapters : [])]
    .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));
  if (!orderedChapters.length) throw new Error('Long-form voiceover requires canonical chapters.');
  const knownChapterIds = new Set(orderedChapters.map((chapter) => String(chapter.id)));
  const unknown = entries.filter(({ scene }) => !knownChapterIds.has(String(scene.chapterId ?? '')));
  if (unknown.length) {
    throw new Error(`Long-form scene(s) missing a canonical chapter: ${unknown.map(({ scene }) => scene.id).join(', ')}`);
  }

  return orderedChapters.flatMap((chapter) => {
    const chapterEntries = entries.filter(({ scene }) => scene.chapterId === chapter.id);
    return chapterEntries.length ? [{
      id: String(chapter.id),
      chapterId: String(chapter.id),
      entries: chapterEntries,
    }] : [];
  });
}
