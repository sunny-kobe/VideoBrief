import type {
  ResearchFact,
  ResearchUncertainty,
  ShortVideoProject,
} from './shortVideoBrief';

const MAX_KEY_FACTS = 12;
const MAX_REQUIRED_UNCERTAINTIES = 6;

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
  const claims = project.research.facts
    .filter((fact) => fact.kind === 'claim' && fact.reviewPriority !== 'reference')
    .sort(rankByReviewValue);
  const required = claims.filter((fact) => fact.reviewPriority === 'required');
  return (required.length ? required : claims).slice(0, MAX_KEY_FACTS);
}

export function requiredResearchUncertainties(project: ShortVideoProject): ResearchUncertainty[] {
  return project.research.uncertainties
    .filter((item) => item.reviewPriority === 'required' && item.riskLevel === 'high')
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
  const completedSources = project.sources.filter((source) => source.processing.status === 'completed').length;
  const allSourcesProcessed = project.sources.length > 0 && completedSources === project.sources.length;

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
