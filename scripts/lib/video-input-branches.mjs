export function planVideoInputBranches(scenes, sourceIndexById) {
  const useCounts = new Map();
  for (const scene of scenes) {
    useCounts.set(scene.sourceId, (useCounts.get(scene.sourceId) ?? 0) + 1);
  }

  const filters = [];
  const labelsBySource = new Map();
  for (const [sourceId, count] of useCounts) {
    const sourceIndex = sourceIndexById.get(sourceId);
    if (sourceIndex == null) throw new Error(`Unknown sourceId ${sourceId}.`);
    const labels = Array.from({ length: count }, (_, index) => `source${sourceIndex}_${index}`);
    labelsBySource.set(sourceId, labels);
    if (count === 1) {
      filters.push(`[${sourceIndex}:v]null[${labels[0]}]`);
      continue;
    }

    const rawLabels = labels.map((label) => `${label}_raw`);
    const outputs = rawLabels.map((label) => `[${label}]`).join('');
    filters.push(`[${sourceIndex}:v]split=${count}${outputs}`);
    filters.push(...rawLabels.map((rawLabel, index) => `[${rawLabel}]fifo[${labels[index]}]`));
  }

  const nextBranchBySource = new Map();
  const sceneInputLabels = scenes.map((scene) => {
    const nextBranch = nextBranchBySource.get(scene.sourceId) ?? 0;
    nextBranchBySource.set(scene.sourceId, nextBranch + 1);
    return labelsBySource.get(scene.sourceId)[nextBranch];
  });
  return { filters, sceneInputLabels };
}
