import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProjectStageContext } from '../scripts/lib/project-stage-context.mjs';

const project = {
  id: 'sample',
  title: 'Sample',
  status: 'review',
  brief: { objective: 'Explain one mechanism.' },
  workflow: { researchApproval: { status: 'approved' } },
  research: {
    facts: [
      { id: 'fact-1', statement: 'Confirmed', reviewStatus: 'confirmed', reviewPriority: 'required', sourceReferences: [] },
      { id: 'fact-2', statement: 'Proposed', reviewStatus: 'proposed', reviewPriority: 'reference', sourceReferences: [] },
    ],
    uncertainties: [
      { id: 'risk-1', statement: 'Blocking', riskLevel: 'high', reviewPriority: 'required', sourceReferences: [] },
      { id: 'risk-2', statement: 'Minor', riskLevel: 'low', reviewPriority: 'reference', sourceReferences: [] },
    ],
  },
  sources: [{ id: 'source-1', label: 'Source', sourceType: 'video', analysis: { extractedText: 'large payload' }, processing: {} }],
  scenes: [{
    id: 'scene-1', enabled: true, title: 'Scene', narration: 'Narration', sourceId: 'source-1',
    sourceStart: 1, sourceEnd: 3, selectedCandidateId: 'candidate-1', selectionStatus: 'codex_reviewed',
    candidates: [{ id: 'candidate-1', sourceId: 'source-1', mediaType: 'video', sourceStart: 1, sourceEnd: 3 }],
    sourceReferences: [],
  }],
};

test('research context keeps confirmed facts and blocking uncertainties without source analysis payloads', () => {
  const context = buildProjectStageContext(project, 'research');
  assert.deepEqual(context.confirmedFacts.map((item: { id: string }) => item.id), ['fact-1']);
  assert.deepEqual(context.blockingUncertainties.map((item: { id: string }) => item.id), ['risk-1']);
  assert.equal('analysis' in context.sources[0], false);
});

test('material context includes only the selected candidate', () => {
  const context = buildProjectStageContext(project, 'material');
  assert.equal(context.scenes[0].selectedCandidate.id, 'candidate-1');
  assert.equal('candidates' in context.scenes[0], false);
});
