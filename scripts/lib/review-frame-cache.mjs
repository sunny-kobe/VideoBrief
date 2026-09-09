import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Frame reuse saves decoding only. It never reuses or grants a review decision.
export function extractCachedReviewFrame({ output, videoSha256, args, extract }) {
  const key = hash(JSON.stringify({ version: 1, videoSha256, args }));
  const metadataPath = `${output}.cache.json`;
  try {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    const bytes = readFileSync(output);
    if (videoSha256 && metadata.key === key && bytes.length > 0 && metadata.sha256 === hash(bytes)) {
      return { success: true, cacheHit: true };
    }
  } catch { /* Missing or damaged cache is a normal miss. */ }
  const result = extract();
  if (result.status !== 0) return { success: false, cacheHit: false };
  let bytes;
  try { bytes = readFileSync(output); } catch { return { success: false, cacheHit: false }; }
  if (!bytes.length) return { success: false, cacheHit: false };
  const temporary = `${metadataPath}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify({ key, sha256: hash(bytes) }));
  renameSync(temporary, metadataPath);
  return { success: true, cacheHit: false };
}
