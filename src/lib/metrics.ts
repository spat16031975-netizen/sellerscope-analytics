export type NullableMetric = number | null;

export function safeDivide(numerator: NullableMetric, denominator: NullableMetric): NullableMetric {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

export function calculateDrr(adSpend: NullableMetric, revenue: NullableMetric): NullableMetric {
  const ratio = safeDivide(adSpend, revenue);
  return ratio === null ? null : ratio * 100;
}

export function calculateRoas(attributedRevenue: NullableMetric, adSpend: NullableMetric): NullableMetric {
  return safeDivide(attributedRevenue, adSpend);
}

export function calculateMargin(profit: NullableMetric, revenue: NullableMetric): NullableMetric {
  const ratio = safeDivide(profit, revenue);
  return ratio === null ? null : ratio * 100;
}

export function completeness(required: Record<string, unknown>): { complete: boolean; missing: string[] } {
  const missing = Object.entries(required)
    .filter(([, value]) => value === null || value === undefined)
    .map(([key]) => key);
  return { complete: missing.length === 0, missing };
}
