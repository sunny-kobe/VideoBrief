import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLongFormEvidenceUnits,
  deduplicateSourceReferences,
  evidenceUnitsAllowReference,
  evidenceUnitContainsReference,
  longFormEvidenceUnitsForPrompt,
  longFormCandidateWindowAllowed,
  longFormChapterVisualSourceIds,
  longFormNarrationBudget,
  normalizedNarrationText,
  selectLongFormEvidenceUnits,
} from '../src/longFormPlanning';
import { initialCandidatesForScene } from '../src/projectPlanningServer';
import { keyResearchFacts } from '../src/researchReview';
import type { ResearchFact, ShortVideoProject } from '../src/shortVideoBrief';

function fact(id: string, reviewStatus: 'proposed' | 'confirmed' | 'rejected' = 'confirmed'): ResearchFact {
  return {
    id,
    statement: `Fact ${id}`,
    sourceReferences: [{
      sourceId: 'video-1',
      locatorType: 'time',
      start: 10,
      end: 12,
      note: 'test',
    }],
    kind: 'claim',
    reviewPriority: 'required',
    briefRelevance: 90,
    reviewStatus,
  };
}

function projectFixture(): ShortVideoProject {
  const chapterFacts = [fact('confirmed'), fact('proposed', 'proposed'), fact('rejected', 'rejected')];
  return {
    brief: { targetDurationSeconds: 600 },
    research: { facts: chapterFacts, uncertainties: [], transcripts: [] },
    sources: [{
      id: 'video-1',
      label: 'Long source',
      sourceType: 'video',
      processing: { status: 'completed' },
      analysis: {
        extractedText: '',
        visualDescription: '',
        hierarchicalSummary: 'Whole source',
        transcript: [],
        facts: chapterFacts,
        uncertainties: [],
        chapters: [{
          id: 'video-1-chapter-01',
          sourceId: 'video-1',
          index: 0,
          start: 0,
          end: 150,
          title: 'Opening',
          summary: 'Opening evidence',
          visualDescription: 'Product screen',
          frameSamples: [],
          transcript: [],
          facts: chapterFacts,
          uncertainties: [],
          processing: {
            status: 'completed',
            inputHash: 'hash',
            model: 'model',
            promptVersion: 'prompt',
            cacheHit: false,
            error: '',
          },
        }],
      },
    }],
  } as unknown as ShortVideoProject;
}

test('long-form evidence is chapter-local and respects fact review state', () => {
  const project = projectFixture();
  const confirmedUnits = buildLongFormEvidenceUnits(project, false);
  assert.deepEqual(confirmedUnits.map((unit) => unit.id), ['video-1-chapter-01']);
  assert.deepEqual(confirmedUnits[0].facts.map((item) => item.id), ['confirmed']);
  const automaticUnits = buildLongFormEvidenceUnits(project, true);
  assert.deepEqual(automaticUnits[0].facts.map((item) => item.id), ['confirmed', 'proposed']);
  assert.deepEqual(
    selectLongFormEvidenceUnits(automaticUnits, ['video-1-chapter-01']).map((unit) => unit.id),
    ['video-1-chapter-01'],
  );
  assert.throws(
    () => selectLongFormEvidenceUnits(automaticUnits, ['unknown']),
    /unknown evidence units/,
  );
});

test('manual long-form prompts cannot see unconfirmed summaries or raw source content', () => {
  const project = projectFixture();
  const chapter = project.sources[0].analysis.chapters[0];
  chapter.summary = 'UNCONFIRMED_SUMMARY';
  chapter.visualDescription = 'UNCONFIRMED_VISUAL_CLAIM';
  chapter.transcript = [{
    id: 'segment-01', sourceId: 'video-1', start: 0, end: 5, text: 'UNCONFIRMED_TRANSCRIPT',
  }];
  chapter.uncertainties = [{
    id: 'resolved', statement: 'Known limitation', resolution: 'Keep as a limitation.',
    sourceReferences: fact('uncertainty-reference').sourceReferences,
    riskLevel: 'high', reviewPriority: 'required', briefRelevance: 90,
  }, {
    id: 'unresolved', statement: 'UNRESOLVED_UNCERTAINTY', resolution: '',
    sourceReferences: fact('unresolved-reference').sourceReferences,
    riskLevel: 'low', reviewPriority: 'reference', briefRelevance: 10,
  }];

  const manual = longFormEvidenceUnitsForPrompt(buildLongFormEvidenceUnits(project, false), false);
  const manualJson = JSON.stringify(manual);
  assert.equal(manualJson.includes('UNCONFIRMED_SUMMARY'), false);
  assert.equal(manualJson.includes('UNCONFIRMED_VISUAL_CLAIM'), false);
  assert.equal(manualJson.includes('UNCONFIRMED_TRANSCRIPT'), false);
  assert.equal(manualJson.includes('Fact proposed'), false);
  assert.equal(manualJson.includes('UNRESOLVED_UNCERTAINTY'), false);
  assert.equal(manualJson.includes('Keep as a limitation.'), true);

  const automatic = longFormEvidenceUnitsForPrompt(buildLongFormEvidenceUnits(project, true), true);
  const automaticJson = JSON.stringify(automatic);
  assert.equal(automaticJson.includes('UNCONFIRMED_SUMMARY'), true);
  assert.equal(automaticJson.includes('Fact proposed'), true);
  assert.equal(automaticJson.includes('UNRESOLVED_UNCERTAINTY'), true);
});

test('chapter prompts expose only facts selected by the outline locators', () => {
  const unit = buildLongFormEvidenceUnits(projectFixture(), false)[0];
  unit.facts.push({
    ...fact('other-confirmed'),
    sourceReferences: [{
      sourceId: 'video-1', locatorType: 'time', start: 30, end: 32, note: 'other',
    }],
  });
  const promptUnits = longFormEvidenceUnitsForPrompt([unit], false, [{
    sourceId: 'video-1', locatorType: 'time', start: 30, end: 32,
  }]);
  assert.deepEqual(promptUnits[0].facts.map((item) => item.id), ['other-confirmed']);
  assert.deepEqual(promptUnits[0].facts[0].sourceReferences, [{
    sourceId: 'video-1', locatorType: 'time', start: 30, end: 32, note: 'other',
  }]);
});

test('source references deduplicate by locator rather than generated note text', () => {
  assert.deepEqual(deduplicateSourceReferences([{
    sourceId: 'video-1', locatorType: 'time', start: 10, end: 12, note: 'outline note',
  }, {
    sourceId: 'video-1', locatorType: 'time', start: 10, end: 12, note: 'chapter note',
  }, {
    sourceId: 'video-1', locatorType: 'time', start: 12, end: 14, note: 'other locator',
  }]), [{
    sourceId: 'video-1', locatorType: 'time', start: 10, end: 12, note: 'outline note',
  }, {
    sourceId: 'video-1', locatorType: 'time', start: 12, end: 14, note: 'other locator',
  }]);
});

test('long-form references must copy an eligible fact or resolved uncertainty locator', () => {
  const project = projectFixture();
  const unit = buildLongFormEvidenceUnits(project, false)[0];
  unit.uncertainties = [{
    id: 'resolved', statement: 'Known limitation', resolution: 'Keep as a limitation.',
    sourceReferences: [{
      sourceId: 'video-1', locatorType: 'time', start: 30, end: 32, note: 'resolved',
    }],
    riskLevel: 'high', reviewPriority: 'required', briefRelevance: 90,
  }, {
    id: 'unresolved', statement: 'Unknown detail', resolution: '',
    sourceReferences: [{
      sourceId: 'video-1', locatorType: 'time', start: 40, end: 42, note: 'unresolved',
    }],
    riskLevel: 'low', reviewPriority: 'reference', briefRelevance: 10,
  }];

  assert.equal(evidenceUnitsAllowReference(unit ? [unit] : [], {
    sourceId: 'video-1', locatorType: 'time', start: 10, end: 12,
  }), true);
  assert.equal(evidenceUnitsAllowReference([unit], {
    sourceId: 'video-1', locatorType: 'time', start: 30, end: 32,
  }), true);
  assert.equal(evidenceUnitsAllowReference([unit], {
    sourceId: 'video-1', locatorType: 'time', start: 40, end: 42,
  }), false);
  assert.equal(evidenceUnitsAllowReference([unit], {
    sourceId: 'video-1', locatorType: 'time', start: 20, end: 22,
  }), false);
  assert.equal(evidenceUnitsAllowReference([unit], {
    sourceId: 'video-1', locatorType: 'time', start: 40, end: 42,
  }, true), true);

  unit.facts[0].sourceReferences = [{
    sourceId: 'video-1', locatorType: 'line', lineStart: 5, lineEnd: 9, note: 'line',
  }];
  assert.equal(evidenceUnitsAllowReference([unit], {
    sourceId: 'video-1', locatorType: 'line', start: 5, end: 9, lineStart: 5, lineEnd: 9,
  }), true);
  assert.equal(evidenceUnitsAllowReference([unit], {
    sourceId: 'video-1', locatorType: 'line', start: 5, end: 9, lineStart: 6, lineEnd: 9,
  }), false);
});

test('time references cannot escape the selected source chapter', () => {
  const [unit] = buildLongFormEvidenceUnits(projectFixture(), true);
  assert.equal(evidenceUnitContainsReference(unit, {
    sourceId: 'video-1', locatorType: 'time', start: 20, end: 30,
  }), true);
  assert.equal(evidenceUnitContainsReference(unit, {
    sourceId: 'video-1', locatorType: 'time', start: 140, end: 160,
  }), false);
  assert.equal(evidenceUnitContainsReference(unit, {
    sourceId: 'video-2', locatorType: 'file',
  }), false);
});

test('chapter candidate retrieval stays inside approved local evidence and broll', () => {
  const project = projectFixture();
  project.materialReview = {
    status: 'approved',
    approvedSourceIds: ['video-1', 'broll-1', 'unrelated-1'],
    reviewedAt: '2026-07-23T00:00:00.000Z',
  };
  project.sources.push(
    {
      id: 'broll-1', sourceType: 'video', materialRole: 'broll', processing: { status: 'completed' },
      analysis: { chapters: [], facts: [], uncertainties: [], transcript: [], extractedText: '', visualDescription: '', hierarchicalSummary: '' },
    } as never,
    {
      id: 'unrelated-1', sourceType: 'video', materialRole: 'official_demo', processing: { status: 'completed' },
      analysis: { chapters: [], facts: [], uncertainties: [], transcript: [], extractedText: '', visualDescription: '', hierarchicalSummary: '' },
    } as never,
  );
  const chapter = { evidenceUnitIds: ['video-1-chapter-01'] };
  assert.deepEqual(longFormChapterVisualSourceIds(project, chapter), ['video-1', 'broll-1']);
  assert.equal(longFormCandidateWindowAllowed(project, chapter, {
    sourceId: 'video-1', sourceStart: 10, sourceEnd: 20,
  }), true);
  assert.equal(longFormCandidateWindowAllowed(project, chapter, {
    sourceId: 'video-1', sourceStart: 140, sourceEnd: 160,
  }), false);
  assert.equal(longFormCandidateWindowAllowed(project, chapter, {
    sourceId: 'broll-1', sourceStart: 140, sourceEnd: 160,
  }), true);
});

test('initial candidates do not fall back to unrelated evidence media', () => {
  const project = projectFixture();
  project.materialReview = {
    status: 'approved',
    approvedSourceIds: ['video-1', 'broll-1', 'image-broll-1'],
    reviewedAt: '2026-07-23T00:00:00.000Z',
  };
  project.sources.push(
    {
      id: 'broll-1', sourceType: 'video', materialRole: 'broll', processing: { status: 'completed' },
      analysis: { chapters: [], facts: [], uncertainties: [], transcript: [], extractedText: '', visualDescription: '', hierarchicalSummary: '' },
    } as never,
    {
      id: 'image-broll-1', sourceType: 'image', materialRole: 'broll', processing: { status: 'completed' },
      analysis: { chapters: [], facts: [], uncertainties: [], transcript: [], extractedText: '', visualDescription: '', hierarchicalSummary: '' },
    } as never,
  );

  const candidates = initialCandidatesForScene(project, [{
    sourceId: 'research-1', locatorType: 'line', lineStart: 1, lineEnd: 2, note: 'Research only.',
  }], 12);

  assert.deepEqual(candidates.map((candidate) => candidate.sourceId), ['broll-1', 'image-broll-1']);
});

test('initial candidates keep explicitly referenced evidence media', () => {
  const project = projectFixture();
  project.materialReview = {
    status: 'approved',
    approvedSourceIds: ['video-1'],
    reviewedAt: '2026-07-23T00:00:00.000Z',
  };

  const candidates = initialCandidatesForScene(project, [{
    sourceId: 'video-1', locatorType: 'time', start: 10, end: 22, note: 'Exact evidence window.',
  }], 12);

  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0], {
    id: 'candidate-01',
    sourceId: 'video-1',
    assetPath: undefined,
    mediaType: 'video',
    sourceStart: 10,
    sourceEnd: 22,
    matchReason: 'Exact evidence window.',
    rightsStatus: undefined,
  });
});

test('long-form research is not truncated to the short-video twelve-fact ceiling', () => {
  const project = projectFixture();
  project.research.facts = Array.from({ length: 15 }, (_, index) => fact(`fact-${index + 1}`));
  assert.equal(keyResearchFacts(project).length, 15);
  project.brief.targetDurationSeconds = 60;
  assert.equal(keyResearchFacts(project).length, 12);
});

test('long-form narration budgets enforce both minimum and maximum script size', () => {
  assert.deepEqual(longFormNarrationBudget(100), {
    minimumCharacters: 240,
    maximumCharacters: 520,
  });
  assert.equal(normalizedNarrationText('第一句。\n\n第二句。'), '第一句。第二句。');
});
