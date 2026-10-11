import type {
  ResearchFact,
  ResearchUncertainty,
  ShortVideoProject,
} from './shortVideoBrief';
import { automaticSourceReadiness } from './productionReadiness';

const MAX_KEY_FACTS = 12;
const MAX_REQUIRED_UNCERTAINTIES = 6;

function researchSourceIds(project: ShortVideoProject) {
  const explicit = project.sources.filter((source) => source.materialRole === 'research');
  const sources = explicit.length > 0 ? explicit : project.sources;
  return new Set(sources.map((source) => source.id));
}

function priorityScore(priority: ResearchFact['reviewPriority']) {
  return priority === 'required' ? 3 : priority === 'supporting' ? 2 : 1;
}

function rankByReviewValue<T extends { reviewPriority: ResearchFact['reviewPriority']; briefRelevance: number; id: string }>(
  left: T,
  right: T,
) {
  return priorityScore(right.reviewPriority) - priorityScore(left.reviewPriority)
    || right.briefRelevance - left.briefRelevance
    || left.id.localeCompare(right.id);
}

export function keyResearchFacts(project: ShortVideoProject): ResearchFact[] {
  const sourceIds = researchSourceIds(project);
  const claims = project.research.facts
    .filter((fact) => (
      fact.kind === 'claim'
      && fact.reviewPriority !== 'reference'
      && fact.sourceReferences.some((reference) => sourceIds.has(reference.sourceId))
    ))
    .sort(rankByReviewValue);
  const required = claims.filter((fact) => fact.reviewPriority === 'required');
  const ranked = required.length ? required : claims;
  return project.brief.targetDurationSeconds >= 180
    ? ranked
    : ranked.slice(0, MAX_KEY_FACTS);
}

export function requiredResearchUncertainties(project: ShortVideoProject): ResearchUncertainty[] {
  const sourceIds = researchSourceIds(project);
  return project.research.uncertainties
    .filter((item) => (
      item.reviewPriority === 'required'
      && item.riskLevel === 'high'
      && item.sourceReferences.some((reference) => sourceIds.has(reference.sourceId))
    ))
    .sort(rankByReviewValue)
    .slice(0, MAX_REQUIRED_UNCERTAINTIES);
}

export function confirmedNarrativeFacts(project: ShortVideoProject) {
  return keyResearchFacts(project).filter((fact) => fact.reviewStatus === 'confirmed');
}

export function researchReviewSummary(project: ShortVideoProject) {
  const keyFacts = keyResearchFacts(project);
  const requiredUncertainties = requiredResearchUncertainties(project);
  const pendingFacts = keyFacts.filter((fact) => fact.reviewStatus === 'proposed');
  const confirmedFacts = keyFacts.filter((fact) => fact.reviewStatus === 'confirmed');
  const unresolvedUncertainties = requiredUncertainties.filter((item) => !item.resolution.trim());
  const sourceIds = researchSourceIds(project);
  const researchSources = project.sources.filter((source) => sourceIds.has(source.id));
  const completedSources = researchSources.filter((source) => source.processing.status === 'completed').length;
  const allSourcesProcessed = automaticSourceReadiness(
    researchSources.map((source) => source.processing.status),
  ).ready;

  return {
    keyFacts,
    keyFactIds: new Set(keyFacts.map((fact) => fact.id)),
    requiredUncertainties,
    requiredUncertaintyIds: new Set(requiredUncertainties.map((item) => item.id)),
    pendingFacts,
    confirmedFacts,
    unresolvedUncertainties,
    completedSources,
    allSourcesProcessed,
    ready: allSourcesProcessed
      && keyFacts.length > 0
      && pendingFacts.length === 0
      && confirmedFacts.length > 0
      && unresolvedUncertainties.length === 0,
  };
}
