import { createHash } from 'node:crypto';

function normalizedId(value, fallback) {
  const id = String(value ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]*$/.test(id) ? id : fallback;
}

function normalizedAspectRatio(value, width, height) {
  if (value === '9:16' || value === '16:9' || value === '1:1') return value;
  if (width === height) return '1:1';
  return width > height ? '16:9' : '9:16';
}

export function resolveProjectRenditions(project) {
  const configured = Array.isArray(project?.renditions) ? project.renditions : [];
  if (configured.length === 0) {
    const width = Number(project?.render?.width ?? 1080);
    const height = Number(project?.render?.height ?? 1920);
    return [{
      id: 'primary',
      label: '主版本',
      primary: true,
      aspectRatio: normalizedAspectRatio(project?.brief?.aspectRatio, width, height),
      width,
      height,
      mediaFit: project?.render?.mediaFit === 'cover' ? 'cover' : 'contain',
      mediaBackground: 'solid',
      outputVideo: String(project?.outputs?.outputVideo ?? ''),
      publicRender: String(project?.outputs?.publicRender ?? ''),
      workDir: String(project?.outputs?.workDir ?? ''),
    }];
  }

  const primaryIndex = Math.max(0, configured.findIndex((item) => item?.primary === true));
  const seen = new Set();
  return configured.map((item, index) => {
    const fallbackId = `rendition-${index + 1}`;
    const id = normalizedId(item?.id, fallbackId);
    if (seen.has(id)) throw new Error(`Duplicate rendition id: ${id}.`);
    seen.add(id);
    const width = Number(item?.width);
    const height = Number(item?.height);
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new Error(`Rendition ${id} requires positive integer width and height.`);
    }
    const primary = index === primaryIndex;
    return {
      id,
      label: String(item?.label ?? '').trim() || id,
      primary,
      aspectRatio: normalizedAspectRatio(item?.aspectRatio, width, height),
      width,
      height,
      mediaFit: item?.mediaFit === 'cover' || item?.mediaFit === 'contain'
        ? item.mediaFit
        : project?.render?.mediaFit === 'cover'
          ? 'cover'
          : 'contain',
      mediaBackground: item?.mediaBackground === 'blurred-fill' ? 'blurred-fill' : 'solid',
      outputVideo: String(item?.outputVideo ?? (primary ? project?.outputs?.outputVideo : '') ?? ''),
      publicRender: String(item?.publicRender ?? (primary ? project?.outputs?.publicRender : '') ?? ''),
      workDir: String(item?.workDir ?? (primary ? project?.outputs?.workDir : '') ?? ''),
    };
  }).map((item) => {
    if (!item.outputVideo || !item.publicRender || !item.workDir) {
      throw new Error(`Rendition ${item.id} requires outputVideo, publicRender, and workDir.`);
    }
    return item;
  });
}

export function resolveProjectRendition(project, requestedId = '') {
  const renditions = resolveProjectRenditions(project);
  const requested = String(requestedId ?? '').trim();
  const rendition = requested
    ? renditions.find((item) => item.id === requested)
    : renditions.find((item) => item.primary) ?? renditions[0];
  if (!rendition) throw new Error(`Unknown rendition: ${requested}.`);
  return rendition;
}

export function renditionBundleFingerprint(items) {
  const normalized = [...items]
    .map((item) => ({ id: String(item.id), videoSha256: String(item.videoSha256) }))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (normalized.length === 0 || normalized.some((item) => !item.id || !item.videoSha256)) return '';
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
