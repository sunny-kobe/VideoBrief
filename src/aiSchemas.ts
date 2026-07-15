import { z } from 'zod';

export const AiSourceReferenceSchema = z.object({
  sourceId: z.string(),
  locatorType: z.enum(['time', 'line', 'image', 'file']),
  start: z.number().nullable(),
  end: z.number().nullable(),
  lineStart: z.number().int().nullable(),
  lineEnd: z.number().int().nullable(),
  note: z.string(),
});

export const SourceUnderstandingSchema = z.object({
  summary: z.string(),
  extractedText: z.string(),
  visualDescription: z.string(),
  transcript: z.array(z.object({
    start: z.number(),
    end: z.number(),
    text: z.string(),
  })),
  facts: z.array(z.object({
    statement: z.string(),
    sourceReferences: z.array(AiSourceReferenceSchema).min(1),
    kind: z.enum(['claim', 'visual_metadata']),
    reviewPriority: z.enum(['required', 'supporting', 'reference']),
    briefRelevance: z.number().min(0).max(100),
  })),
  uncertainties: z.array(z.object({
    statement: z.string(),
    sourceReferences: z.array(AiSourceReferenceSchema).min(1),
    riskLevel: z.enum(['high', 'medium', 'low']),
    reviewPriority: z.enum(['required', 'supporting', 'reference']),
    briefRelevance: z.number().min(0).max(100),
  })),
});

export const NarrativePlanSchema = z.object({
  conclusion: z.string(),
  hook: z.string(),
  outline: z.array(z.string()),
  voiceoverScript: z.string(),
  sourceReferences: z.array(AiSourceReferenceSchema),
  uncertainties: z.array(z.string()),
  scenes: z.array(z.object({
    eyebrow: z.string(),
    title: z.string(),
    narration: z.string(),
    subtitle: z.string(),
    visualRequirement: z.string(),
    sourceReferences: z.array(AiSourceReferenceSchema),
  })),
});

export const CandidateRankingSchema = z.object({
  rankings: z.array(z.object({
    sceneIndex: z.number().int(),
    sourceId: z.string(),
    sourceStart: z.number(),
    sourceEnd: z.number(),
    matchReason: z.string(),
  })),
});

export const ProductionAssetsSchema = z.object({
  coverTitle: z.string(),
  platformTitle: z.string(),
  description: z.string(),
  hashtags: z.array(z.string()),
});

export type SourceUnderstanding = z.infer<typeof SourceUnderstandingSchema>;
export type NarrativePlan = z.infer<typeof NarrativePlanSchema>;
export type CandidateRanking = z.infer<typeof CandidateRankingSchema>;
export type ProductionAssets = z.infer<typeof ProductionAssetsSchema>;
