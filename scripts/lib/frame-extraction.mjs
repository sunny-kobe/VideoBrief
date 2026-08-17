export function exactFrameExtractionArgs(input, second, output) {
  return [
    '-y',
    '-i', input,
    '-ss', Math.max(0, Number(second) || 0).toFixed(3),
    '-frames:v', '1',
    '-update', '1',
    output,
  ];
}
