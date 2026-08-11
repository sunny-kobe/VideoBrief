function clampUnit(value, fallback = 0.5) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function decimal(value) {
  return Number(value).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export function resolveMediaFraming({ scene, projectFit, projectBackground, width, height }) {
  const fit = scene?.mediaFit === 'cover' || scene?.mediaFit === 'contain'
    ? scene.mediaFit
    : projectFit === 'cover'
      ? 'cover'
      : 'contain';
  const focalX = clampUnit(scene?.mediaFocalX);
  const focalY = clampUnit(scene?.mediaFocalY);
  const requestedBackground = scene?.mediaBackground === 'blurred-fill'
    || projectBackground === 'blurred-fill'
    ? 'blurred-fill'
    : 'solid';
  const background = requestedBackground === 'blurred-fill' && fit === 'contain' && height > width
    ? 'blurred-fill'
    : 'solid';

  if (background === 'blurred-fill') {
    const previewWidth = Math.max(2, Math.round(width / 4));
    const previewHeight = Math.max(2, Math.round(height / 4));
    const foregroundWidth = Math.max(2, width - 32);
    const foregroundHeight = Math.max(2, height - 32);
    return {
      fit,
      background,
      focalX,
      focalY,
      filter: '',
      backgroundFilter: [
        `scale=${previewWidth}:${previewHeight}:force_original_aspect_ratio=increase`,
        `crop=${previewWidth}:${previewHeight}:(iw-ow)*${decimal(focalX)}:(ih-oh)*${decimal(focalY)}`,
        'boxblur=luma_radius=20:luma_power=2:chroma_radius=10:chroma_power=1',
        `scale=${width}:${height}`,
        'eq=contrast=0.72:brightness=-0.015:saturation=0.45',
      ].join(','),
      foregroundFilter: [
        `scale=${foregroundWidth}:${foregroundHeight}:force_original_aspect_ratio=decrease`,
        'pad=iw+8:ih+8:4:4:color=0x364152',
      ].join(','),
      overlayFilter: 'overlay=(W-w)/2:(H-h)/2:format=auto',
    };
  }

  if (fit === 'cover') {
    return {
      fit,
      background,
      focalX,
      focalY,
      filter: [
        `scale=${width}:${height}:force_original_aspect_ratio=increase`,
        `crop=${width}:${height}:(iw-ow)*${decimal(focalX)}:(ih-oh)*${decimal(focalY)}`,
      ].join(','),
    };
  }

  if (width > height) {
    const topBand = Math.round(height * 0.12);
    const bottomBand = Math.round(height * 0.18);
    const mediaHeight = height - topBand - bottomBand;
    return {
      fit,
      background,
      focalX,
      focalY,
      filter: `scale=${width}:${mediaHeight}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh+${topBand}-${bottomBand}-ih)/2:color=0x080b10`,
    };
  }

  return {
    fit,
    background,
    focalX,
    focalY,
    filter: `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x080b10`,
  };
}
