import { produceProjectAutomatically } from '../src/projectPlanningServer';
import {
  prepareProjectSourcesForAutomaticProduction,
  projectSourceProcessingStatus,
} from '../src/sourceProcessingQueueServer';

try {
  process.loadEnvFile('.env.local');
} catch {
  // The regular environment may already contain the required server-only values.
}

const projectId = process.argv[2];
const instruction = process.argv.slice(3).join(' ').trim();
if (!projectId) throw new Error('用法：tsx scripts/plan-project.ts <project-id> [创作要求]');

console.log('[videobrief-planning-stage] waiting_sources');
const initialPreparation = prepareProjectSourcesForAutomaticProduction(projectId);
while (prepareProjectSourcesForAutomaticProduction(projectId).state === 'processing_sources') {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
}
const sourceStatus = projectSourceProcessingStatus(projectId);
const failedSources = sourceStatus.project.sources
  .filter((source) => source.processing.status === 'failed')
  .map((source) => ({ sourceId: source.id, error: source.processing.error || '来源处理失败' }));

const project = await produceProjectAutomatically(projectId, instruction, {
  onStage(stage) {
    console.log(`[videobrief-planning-stage] ${stage}`);
  },
});
console.log(JSON.stringify({
  projectId,
  queuedSourceIds: initialPreparation.state === 'processing_sources'
    ? initialPreparation.jobs.flatMap((job) => job ? [job.sourceId] : [])
    : [],
  failedSources,
  scenes: project.scenes.length,
  chapters: project.chapters.length,
  activeNarrative: project.narrative.activeVersionId,
  selectedSources: project.scenes.map((scene) => scene.sourceId),
}, null, 2));
