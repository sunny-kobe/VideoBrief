function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function decimal(value) {
  return Number(value).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export function resolveMediaMotion({ scene, width, height, fps, frameCount }) {
  const mode = ['push-in', 'pull-out'].includes(scene?.mediaMotion)
    ? scene.mediaMotion
    : 'none';
  if (mode === 'none') return { mode, amount: 0, filter: '' };

  const amount = clamp(scene?.mediaMotionAmount, 0.02, 0.12, 0.06);
  const focalX = clamp(scene?.mediaFocalX, 0, 1, 0.5);
  const focalY = clamp(scene?.mediaFocalY, 0, 1, 0.5);
  const lastFrame = Math.max(1, Number(frameCount) - 1);
  const maximumZoom = 1 + amount;
  const zoom = mode === 'push-in'
    ? `min(1+on*${decimal(amount)}/${lastFrame},${decimal(maximumZoom)})`
    : `max(${decimal(maximumZoom)}-on*${decimal(amount)}/${lastFrame},1)`;
  return {
    mode,
    amount,
    filter: [
      `zoompan=z='${zoom}'`,
      `x='(iw-iw/zoom)*${decimal(focalX)}'`,
      `y='(ih-ih/zoom)*${decimal(focalY)}'`,
      'd=1',
      `s=${width}x${height}`,
      `fps=${fps}`,
    ].join(':'),
  };
}
