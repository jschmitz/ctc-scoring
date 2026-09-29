import { describe, expect, it } from "vitest";
import { computeTotal } from "../scoring";
import { hashString, seededRandom, simulateCounts, teamSkill } from "../simulate";

const archery = [
  { id: "center", label: "Orange center", points: 5, position: 1 },
  { id: "black", label: "Black", points: 2, position: 2 },
  { id: "board", label: "On the board", points: 1, position: 3 },
];
const goals = [{ id: "goals", label: "Goals", points: 1, position: 1 }];

describe("seededRandom", () => {
  it("is repeatable and stays in [0, 1)", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const values = Array.from({ length: 1000 }, () => a());
    expect(values).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });
});

describe("teamSkill", () => {
  it("is stable per team and within 0.75–1.25", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `team-${i}`);
    for (const id of ids) {
      expect(teamSkill(id)).toBe(teamSkill(id));
      expect(teamSkill(id)).toBeGreaterThanOrEqual(0.75);
      expect(teamSkill(id)).toBeLessThanOrEqual(1.25);
    }
    expect(new Set(ids.map(teamSkill)).size).toBeGreaterThan(100);
  });

  it("hashString is deterministic", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
  });
});

describe("simulateCounts", () => {
  it("returns a non-negative whole count for every component and nothing else", () => {
    const random = seededRandom(1);
    for (let i = 0; i < 200; i++) {
      const counts = simulateCounts(archery, 1, random);
      expect(Object.keys(counts).sort()).toEqual(["black", "board", "center"]);
      for (const n of Object.values(counts)) {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("hits high-point targets less often than low-point ones", () => {
    const random = seededRandom(7);
    const sums = { center: 0, black: 0, board: 0 };
    for (let i = 0; i < 2000; i++) {
      const c = simulateCounts(archery, 1, random);
      sums.center += c.center;
      sums.black += c.black;
      sums.board += c.board;
    }
    expect(sums.board).toBeGreaterThan(sums.black);
    expect(sums.black).toBeGreaterThan(sums.center);
  });

  it("gives stronger teams higher totals on average", () => {
    const avg = (skill: number) => {
      const random = seededRandom(3);
      let sum = 0;
      for (let i = 0; i < 2000; i++) sum += computeTotal(goals, simulateCounts(goals, skill, random));
      return sum / 2000;
    };
    expect(avg(1.25)).toBeGreaterThan(avg(0.75) * 1.5);
  });

  it("produces plausible single-item counts for a six-minute station", () => {
    const random = seededRandom(11);
    for (let i = 0; i < 500; i++) {
      const n = simulateCounts(goals, 1.25, random).goals;
      expect(n).toBeLessThanOrEqual(20);
    }
  });

  it("handles a challenge with no scoring items", () => {
    expect(simulateCounts([], 1)).toEqual({});
  });
});
