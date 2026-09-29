import type { Counts, ScoringComponent } from "./scoring";

/** Small seeded PRNG (mulberry32), so simulations are repeatable in tests. Returns [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string (FNV-1a). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A team's fixed skill, 0.75–1.25, derived from its id. The same team is
 * consistently strong or weak across challenges, so standings spread out
 * the way a real event's do instead of all landing near the average.
 */
export function teamSkill(teamId: string): number {
  return 0.75 + (hashString(teamId) % 1000) / 1999;
}

/**
 * Plausible per-component counts for one team at one challenge.
 *
 * Models the six-minute station as a run of attempts (more for stronger teams).
 * Each attempt misses or lands on one scoring component; higher-point components
 * are proportionally harder to hit (Archery's center is rarer than the board).
 * Works for any challenge setup, since it only looks at the point values.
 */
export function simulateCounts(components: ScoringComponent[], skill: number, random: () => number = Math.random): Counts {
  const counts: Counts = Object.fromEntries(components.map((c) => [c.id, 0]));
  if (components.length === 0) return counts;

  const attempts = Math.round((6 + random() * 10) * skill);
  const hitRate = Math.min(0.9, Math.max(0.3, 0.6 * skill));
  const weights = components.map((c) => 1 / Math.max(1, c.points));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  for (let i = 0; i < attempts; i++) {
    if (random() >= hitRate) continue;
    let pick = random() * totalWeight;
    const index = weights.findIndex((w) => (pick -= w) < 0);
    counts[components[index === -1 ? components.length - 1 : index].id] += 1;
  }
  return counts;
}
