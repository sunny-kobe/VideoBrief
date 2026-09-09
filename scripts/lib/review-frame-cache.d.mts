export function extractCachedReviewFrame(input: {
  output: string;
  videoSha256: string;
  args: string[];
  extract: () => { status: number | null };
}): { success: boolean; cacheHit: boolean };
