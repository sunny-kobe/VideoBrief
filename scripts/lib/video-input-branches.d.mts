export function planVideoInputBranches(
  scenes: Array<{ sourceId: string }>,
  sourceIndexById: Map<string, number>,
): { filters: string[]; sceneInputLabels: string[] };
