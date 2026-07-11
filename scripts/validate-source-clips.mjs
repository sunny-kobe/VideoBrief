import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const strict = process.argv.includes('--strict');
const manifestPath = resolve('content/source-clips.manifest.json');
const timelinePath = resolve('src/shortVideoTimeline.ts');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const timeline = readFileSync(timelinePath, 'utf8');
const stringConstants = Object.fromEntries(
  [...timeline.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*['"]([^'"]+)['"]/g)].map(
    (match) => [match[1], match[2]],
  ),
);
const clipPaths = [...timeline.matchAll(/src:\s*(?:['"]([^'"]+)['"]|([A-Za-z_$][\w$]*))/g)]
  .map((match) => match[1] ?? stringConstants[match[2]])
  .filter(Boolean);
const uniqueClipPaths = [...new Set(clipPaths)];

const issues = [];
const warnings = [];

for (const clipPath of uniqueClipPaths) {
  const clip = manifest.clips[clipPath];

  if (!clip) {
    issues.push(`Missing manifest entry for ${clipPath}`);
    continue;
  }

  if (!clip.publishable && clip.productionFallback !== 'original-motion') {
    const message = `${clipPath} is ${clip.rightsStatus}; ${clip.replacementNeeded}`;
    if (strict) issues.push(message);
    else warnings.push(message);
  }

  if (!clip.publishable && clip.productionFallback === 'original-motion') {
    warnings.push(`${clipPath} is ${clip.rightsStatus}; production export will use original motion visuals instead of this external clip.`);
  }

  if (clip.publishable && !clip.sourceUrl) {
    issues.push(`${clipPath} is publishable but has no sourceUrl.`);
  }

  if (clip.publishable && clip.rightsStatus !== 'cleared') {
    issues.push(`${clipPath} is publishable but rightsStatus is ${clip.rightsStatus}; only cleared clips may be published.`);
  }
}

if (warnings.length > 0) {
  console.warn('Source clip warnings:');
  for (const warning of warnings) {
    console.warn(`  - ${warning}`);
  }
}

if (issues.length > 0) {
  console.error('Source clip validation failed:');
  for (const issue of issues) {
    console.error(`  - ${issue}`);
  }
  process.exit(1);
}

console.log(
  `Validated ${uniqueClipPaths.length} source clip reference${uniqueClipPaths.length === 1 ? '' : 's'}${strict ? ' for production' : ' for review'}.`,
);
