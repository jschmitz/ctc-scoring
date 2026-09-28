import { describe, expect, it } from "vitest";
import { generateRotation, roundCount } from "../rotation";

const challenges = ["c1", "c2", "c3", "c4", "c5", "c6"];
const teams = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);

describe.each([
  [3, 1],
  [6, 1],
  [8, 1],
  [10, 2],
  [12, 2],
  [18, 2],
  [18, 3],
])("%i teams, %i per station", (n, capacity) => {
  const slots = generateRotation(teams(n), challenges, capacity);

  it("gives every team every challenge exactly once", () => {
    for (const t of teams(n)) {
      const visited = slots.filter((s) => s.team_id === t).map((s) => s.challenge_id);
      expect(visited.sort()).toEqual([...challenges].sort());
    }
  });

  it("puts each team at one station per round", () => {
    const keys = slots.map((s) => `${s.team_id}:${s.round_number}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never exceeds station capacity", () => {
    const load = new Map<string, number>();
    for (const s of slots) {
      const key = `${s.round_number}:${s.challenge_id}`;
      load.set(key, (load.get(key) ?? 0) + 1);
    }
    expect(Math.max(...load.values())).toBeLessThanOrEqual(capacity);
  });

  it("takes as many rounds as stations or team groups, whichever is more", () => {
    expect(roundCount(slots)).toBe(Math.max(challenges.length, Math.ceil(n / capacity)));
  });
});

it("rests two teams per round when 8 teams share 6 stations", () => {
  const slots = generateRotation(teams(8), challenges, 1);
  for (let r = 1; r <= 8; r++) {
    expect(slots.filter((s) => s.round_number === r)).toHaveLength(6);
  }
});

it("returns nothing without teams or challenges", () => {
  expect(generateRotation([], challenges)).toEqual([]);
  expect(generateRotation(teams(4), [])).toEqual([]);
});
