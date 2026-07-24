import type {
  ProjectChapter,
  ResearchFact,
  ResearchUncertainty,
  ShortVideoProject,
  SourceReference,
  TranscriptSegment,
} from './shortVideoBrief';

export interface LongFormEvidenceUnit {
  id: string;
  sourceId: string;
  label: string;
  sourceType: string;
  start?: number;
  end?: number;
  summary: string;
  visualDescription: string;
  extractedText: string;
  transcript: TranscriptSegment[];
  facts: ResearchFact[];
  uncertainties: ResearchUncertainty[];
}

export interface LongFormPromptEvidenceUnit {
  id: string;
  sourceId: string;
  label: string;
  sourceType: string;
  start?: number;
  end?: number;
  facts: Array<Pick<ResearchFact, 'id' | 'statement' | 'sourceReferences'>>;
  uncertainties: Array<Pick<ResearchUncertainty, 'id' | 'statement' | 'resolution' | 'sourceReferences'>>;
  summary?: string;
  visualDescription?: string;
  extractedText?: string;
  transcript?: TranscriptSegment[];
}

interface ReferenceLocator {
  sourceId: string;
  locatorType: SourceReference['locatorType'];
  start?: number | null;
  end?: number | null;
  lineStart?: number | null;
  lineEnd?: number | null;
}

export const LONG_FORM_MIN_NARRATION_CHARACTERS_PER_SECOND = 2.4;
export const LONG_FORM_MAX_NARRATION_CHARACTERS_PER_SECOND = 5.2;

export function longFormNarrationBudget(targetDurationSeconds: number) {
  const target = Math.max(1, Number(targetDurationSeconds) || 0);
  return {
    minimumCharacters: Math.max(40, Math.floor(target * LONG_FORM_MIN_NARRATION_CHARACTERS_PER_SECOND)),
    maximumCharacters: Math.max(42, Math.ceil(target * LONG_FORM_MAX_NARRATION_CHARACTERS_PER_SECOND)),
  };
}

export function normalizedNarrationText(value: string) {
  return Array.from(String(value)).filter((character) => !/\s/.test(character)).join('');
}

function eligibleFacts(facts: ResearchFact[], allowUnconfirmedFacts: boolean) {
  return facts.filter((fact) => allowUnconfirmedFacts
    ? fact.reviewStatus !== 'rejected'
    : fact.reviewStatus === 'confirmed');
}

export function buildLongFormEvidenceUnits(
  project: ShortVideoProject,
  allowUnconfirmedFacts = false,
) {
  return project.sources
    .filter((source) => source.processing.status === 'completed')
    .flatMap<LongFormEvidenceUnit>((source) => {
      if (source.analysis.chapters.length) {
        return source.analysis.chapters.map((chapter) => ({
          id: chapter.id,
          sourceId: source.id,
          label: `${source.label} / ${chapter.title}`,
          sourceType: source.sourceType,
          start: chapter.start,
          end: chapter.end,
          summary: chapter.summary,
          visualDescription: chapter.visualDescription,
          extractedText: '',
          transcript: chapter.transcript,
          facts: eligibleFacts(chapter.facts, allowUnconfirmedFacts),
          uncertainties: chapter.uncertainties,
        }));
      }
      return [{
        id: `${source.id}:whole`,
        sourceId: source.id,
        label: source.label,
        sourceType: source.sourceType,
        summary: source.analysis.hierarchicalSummary
          || source.analysis.visualDescription
          || source.analysis.extractedText.slice(0, 2_000),
        visualDescription: source.analysis.visualDescription,
        extractedText: source.analysis.extractedText,
        transcript: source.analysis.transcript,
        facts: eligibleFacts(source.analysis.facts, allowUnconfirmedFacts),
        uncertainties: source.analysis.uncertainties,
      }];
    });
}

export function selectLongFormEvidenceUnits(
  units: LongFormEvidenceUnit[],
  evidenceUnitIds: string[],
) {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const selected = evidenceUnitIds.map((id) => byId.get(id));
  const missing = evidenceUnitIds.filter((_, index) => !selected[index]);
  if (missing.length) throw new Error(`Long-form outline referenced unknown evidence units: ${missing.join(', ')}`);
  return selected as LongFormEvidenceUnit[];
}

export function longFormEvidenceUnitsForPrompt(
  units: LongFormEvidenceUnit[],
  allowUnconfirmedFacts = false,
  allowedReferences?: ReferenceLocator[],
): LongFormPromptEvidenceUnit[] {
  const referenceAllowed = (reference: SourceReference) => (
    !allowedReferences
    || allowedReferences.some((allowed) => sourceReferenceLocatorsMatch(reference, allowed))
  );
  return units.map((unit) => ({
    id: unit.id,
    sourceId: unit.sourceId,
    label: unit.label,
    sourceType: unit.sourceType,
    ...(unit.start == null ? {} : { start: unit.start }),
    ...(unit.end == null ? {} : { end: unit.end }),
    facts: unit.facts
      .filter((fact) => fact.sourceReferences.some(referenceAllowed))
      .map((fact) => ({
        id: fact.id,
        statement: fact.statement,
        sourceReferences: fact.sourceReferences.filter(referenceAllowed),
      })),
    uncertainties: unit.uncertainties
      .filter((item) => allowUnconfirmedFacts || item.resolution.trim())
      .filter((item) => item.sourceReferences.some(referenceAllowed))
      .map((item) => ({
        id: item.id,
        statement: item.statement,
        resolution: item.resolution,
        sourceReferences: item.sourceReferences.filter(referenceAllowed),
      })),
    ...(allowUnconfirmedFacts ? {
      summary: unit.summary,
      visualDescription: unit.visualDescription,
      extractedText: unit.extractedText.slice(0, 12_000),
      transcript: unit.transcript,
    } : {}),
  }));
}

export function deduplicateSourceReferences(references: SourceReference[]) {
  return references.filter((reference, index) => (
    references.findIndex((candidate) => sourceReferenceLocatorsMatch(candidate, reference)) === index
  ));
}

export function evidenceUnitContainsReference(
  unit: LongFormEvidenceUnit,
  reference: {
    sourceId: string;
    locatorType: SourceReference['locatorType'];
    start?: number | null;
    end?: number | null;
  },
) {
  if (unit.sourceId !== reference.sourceId) return false;
  if (reference.locatorType !== 'time' || unit.start == null || unit.end == null) return true;
  if (reference.start == null || reference.end == null) return false;
  return reference.start >= unit.start && reference.end <= unit.end;
}

export function sourceReferenceLocatorsMatch(
  left: ReferenceLocator,
  right: ReferenceLocator,
) {
  if (left.sourceId !== right.sourceId || left.locatorType !== right.locatorType) return false;
  if (left.locatorType === 'time') {
    return (left.start ?? null) === (right.start ?? null)
      && (left.end ?? null) === (right.end ?? null);
  }
  if (left.locatorType === 'line') {
    return (left.lineStart ?? null) === (right.lineStart ?? null)
      && (left.lineEnd ?? null) === (right.lineEnd ?? null);
  }
  return true;
}

export function evidenceUnitsAllowReference(
  units: LongFormEvidenceUnit[],
  reference: {
    sourceId: string;
    locatorType: SourceReference['locatorType'];
    start?: number | null;
    end?: number | null;
    lineStart?: number | null;
    lineEnd?: number | null;
  },
  allowUnconfirmedFacts = false,
) {
  const allowedReferences = units.flatMap((unit) => [
    ...unit.facts.flatMap((fact) => fact.sourceReferences),
    ...unit.uncertainties
      .filter((item) => allowUnconfirmedFacts || item.resolution.trim())
      .flatMap((item) => item.sourceReferences),
  ]);
  return allowedReferences.some((allowed) => sourceReferenceLocatorsMatch(allowed, reference));
}

export function longFormChapterVisualSourceIds(
  project: ShortVideoProject,
  chapter: Pick<ProjectChapter, 'evidenceUnitIds'>,
) {
  const selectedUnitSourceIds = new Set(selectLongFormEvidenceUnits(
    buildLongFormEvidenceUnits(project, true),
    chapter.evidenceUnitIds ?? [],
  ).map((unit) => unit.sourceId));
  const approved = new Set(project.materialReview.approvedSourceIds);
  return project.sources
    .filter((source) => approved.has(source.id))
    .filter((source) => source.sourceType === 'video' || source.sourceType === 'image')
    .filter((source) => selectedUnitSourceIds.has(source.id) || source.materialRole === 'broll')
    .map((source) => source.id);
}

export function longFormCandidateWindowAllowed(
  project: ShortVideoProject,
  chapter: Pick<ProjectChapter, 'evidenceUnitIds'>,
  candidate: { sourceId: string; sourceStart: number; sourceEnd: number },
) {
  const source = project.sources.find((item) => item.id === candidate.sourceId);
  if (!source) return false;
  if (source.materialRole === 'broll') return true;
  const units = selectLongFormEvidenceUnits(
    buildLongFormEvidenceUnits(project, true),
    chapter.evidenceUnitIds ?? [],
  ).filter((unit) => unit.sourceId === candidate.sourceId);
  return units.some((unit) => (
    unit.start == null
    || unit.end == null
    || (candidate.sourceStart >= unit.start && candidate.sourceEnd <= unit.end)
  ));
}
