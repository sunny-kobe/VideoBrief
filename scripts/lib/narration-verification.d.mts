export interface NarrationVerificationResult {
  passed: boolean;
  similarity: number;
  lengthRatio: number;
  expectedCharacters: number;
  transcriptCharacters: number;
  termChecks: Array<{
    term: string;
    aliases: string[];
    relevant: boolean;
    matched: boolean;
    matchedAlias: string;
  }>;
  warnings: string[];
}

export function normalizeNarrationText(value: string): string;
export function verifyNarrationTerms(
  expectedText: string,
  transcriptText: string,
  terms?: Array<string | { term: string; aliases?: string[] }>,
): NarrationVerificationResult['termChecks'];
export function verifyNarrationTranscript(
  expectedText: string,
  transcriptText: string,
  terms?: Array<string | { term: string; aliases?: string[] }>,
): NarrationVerificationResult;
