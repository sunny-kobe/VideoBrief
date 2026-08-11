import { createHash } from 'node:crypto';

const NON_PACKAGE_FIELDS = new Set([
  'status',
  'technical_status',
  'publication_status',
  'market_status',
  'lifecycle',
  'production',
  'workflow',
]);

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function renderSource(source) {
  return {
    id: source.id,
    sourceType: source.sourceType,
    assetPath: source.assetPath,
    contentHash: source.contentHash ?? source.processing?.inputHash ?? '',
  };
}

function renderCandidate(candidate) {
  const { rightsStatus: _rightsStatus, ...renderInput } = candidate ?? {};
  return renderInput;
}

function renderScene(scene) {
  const {
    selectionStatus: _selectionStatus,
    selectionReviewedAt: _selectionReviewedAt,
    selectionNote: _selectionNote,
    generatedBy: _generatedBy,
    userEdited: _userEdited,
    ...renderInput
  } = scene ?? {};
  return {
    ...renderInput,
    candidates: Array.isArray(scene?.candidates)
      ? scene.candidates.map(renderCandidate)
      : [],
  };
}

export function productionContent(project) {
  return {
    schemaVersion: project?.schemaVersion,
    id: project?.id,
    title: project?.title,
    brief: project?.brief,
    sources: Array.isArray(project?.sources) ? project.sources.map(renderSource) : [],
    chapters: project?.chapters ?? [],
    outputs: project?.outputs,
    renditions: project?.renditions ?? [],
    render: project?.render,
    scenes: Array.isArray(project?.scenes) ? project.scenes.map(renderScene) : [],
  };
}

export function packageContent(project) {
  return Object.fromEntries(
    Object.entries(project ?? {}).filter(([key]) => !NON_PACKAGE_FIELDS.has(key)),
  );
}

export function productionContentFingerprint(project) {
  return hash(productionContent(project));
}

export function packageContentFingerprint(project) {
  return hash(packageContent(project));
}
