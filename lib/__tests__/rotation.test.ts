import { describe, expect, it } from "vitest";
import { assignSlot, generateRotation, rotationIssues, roundCount } from "../rotation";

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

describe("assignSlot", () => {
  const base = generateRotation(["a", "b"], ["c1", "c2", "c3"]);
  const at = (slots: ReturnType<typeof generateRotation>, team: string, round: number) =>
    slots.find((s) => s.team_id === team && s.round_number === round)?.challenge_id ?? null;

  it("swaps with the round where the team already has that challenge", () => {
    const before = [at(base, "a", 1), at(base, "a", 2)];
    const next = assignSlot(base, "a", 1, before[1]);
    expect([at(next, "a", 1), at(next, "a", 2)]).toEqual([before[1], before[0]]);
    expect(next).toHaveLength(base.length);
  });

  it("rests a team, and moves a challenge into a free round", () => {
    const rested = assignSlot(base, "a", 2, null);
    expect(at(rested, "a", 2)).toBeNull();
    const moved = assignSlot(rested, "a", 4, at(base, "a", 3));
    expect(at(moved, "a", 4)).toBe(at(base, "a", 3));
    expect(at(moved, "a", 3)).toBeNull();
  });

  it("leaves other teams alone", () => {
    const next = assignSlot(base, "a", 1, null);
    expect(next.filter((s) => s.team_id === "b")).toEqual(base.filter((s) => s.team_id === "b"));
  });
});

describe("rotationIssues", () => {
  it("is clean for a generated rotation", () => {
    const slots = generateRotation(teams(8), challenges, 1);
    const { overloaded, missing } = rotationIssues(slots, teams(8), challenges, 1);
    expect(overloaded.size).toBe(0);
    expect(missing.size).toBe(0);
  });

  it("flags crowded stations and skipped challenges", () => {
    const slots = [
      { round_number: 1, team_id: "t1", challenge_id: "c1" },
      { round_number: 1, team_id: "t2", challenge_id: "c1" },
    ];
    const { overloaded, missing } = rotationIssues(slots, ["t1", "t2"], ["c1", "c2"], 1);
    expect([...overloaded]).toEqual(["1:c1"]);
    expect(missing.get("t1")).toEqual(["c2"]);
  });
});
