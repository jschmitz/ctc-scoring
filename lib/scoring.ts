export type ScoringComponent = {
  id: string;
  label: string;
  points: number;
  position: number;
};

export type Counts = Record<string, number>;

/** Total points for a challenge given per-component counts. Mirrors `save_score` in SQL. */
export function computeTotal(components: ScoringComponent[], counts: Counts): number {
  return components.reduce((sum, c) => sum + c.points * Math.max(0, counts[c.id] ?? 0), 0);
}

/** One-line breakdown such as "2×5 + 3×2 + 1×1 = 17". */
export function describeTotal(components: ScoringComponent[], counts: Counts): string {
  const parts = components.map((c) => `${counts[c.id] ?? 0}×${c.points}`);
  return `${parts.join(" + ")} = ${computeTotal(components, counts)}`;
}
