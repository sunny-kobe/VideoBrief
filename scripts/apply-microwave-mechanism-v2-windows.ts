import { applyProductionWorkflowAction } from '../src/productionWorkflow';
import { updateCanonicalProject } from '../src/shortVideoProjectServer';

const projectId = 'microwave-mechanism-style-poc-20260819';
const sceneDurations = [6.933333, 7.3, 7.366667, 6.066667, 8.066667, 8.466667] as const;

updateCanonicalProject(projectId, (project) => ({
  ...project,
  brief: {
    ...project.brief,
    objective: '用约 45 秒，让普通观众直观理解微波炉为什么加热快、为什么会外热内冷，以及转盘有什么用。',
    targetDurationSeconds: 45,
  },
  scenes: project.scenes.map((scene, index) => {
    const sourceEnd = scene.sourceStart + sceneDurations[index];
    return {
      ...scene,
      sourceEnd,
      candidates: scene.candidates.map((candidate) =>
        candidate.id === scene.selectedCandidateId ? { ...candidate, sourceEnd } : candidate),
      sourceReferences: scene.sourceReferences.map((reference) =>
        reference.sourceId === scene.sourceId && reference.locatorType === 'time'
          ? { ...reference, end: sourceEnd }
          : reference),
    };
  }),
  materialQualityReview: undefined,
}));

updateCanonicalProject(projectId, (project) => applyProductionWorkflowAction(
  project,
  { renderState: 'missing', acceptancePassed: false, packageReady: false, videoSha256: '', packageSha256: '' },
  {
    type: 'approve_topic',
    decidedBy: '用户',
    note: '用户要求降低 AI 味并强化前三秒；根据正式配音时长把六幕收紧为约 44 秒。',
  },
));

updateCanonicalProject(projectId, (project) => applyProductionWorkflowAction(
  project,
  { renderState: 'missing', acceptancePassed: false, packageReady: false, videoSha256: '', packageSha256: '' },
  {
    type: 'approve_research',
    decidedBy: '用户',
    note: '本轮只调整观众表达、视觉质感和节奏，继续沿用已确认的事实来源。',
  },
));

console.log(JSON.stringify({ projectId, sceneDurations }, null, 2));
