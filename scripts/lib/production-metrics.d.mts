export interface ProductionMetricsInput {
  project: Record<string, any>;
  manifest: Record<string, any>;
  finalizedAt: string;
}

export function buildProductionMetrics(input: ProductionMetricsInput): Record<string, any>;
