import { describe, expect, it } from "vitest";
import { computeTotal, describeTotal } from "../scoring";

const archery = [
  { id: "center", label: "Orange center", points: 5, position: 1 },
  { id: "black", label: "Black", points: 2, position: 2 },
  { id: "board", label: "On the board", points: 1, position: 3 },
];
const tossAndGo = [
  { id: "hole", label: "In the hole", points: 2, position: 1 },
  { id: "board", label: "On the board", points: 1, position: 2 },
];
const single = [{ id: "goals", label: "Goals", points: 1, position: 1 }];

describe("computeTotal", () => {
  it("weights archery hits", () => {
    expect(computeTotal(archery, { center: 2, black: 3, board: 1 })).toBe(17);
  });

  it("weights cornhole tosses", () => {
    expect(computeTotal(tossAndGo, { hole: 4, board: 5 })).toBe(13);
  });

  it("counts single-component challenges one point each", () => {
    expect(computeTotal(single, { goals: 9 })).toBe(9);
  });

  it("treats missing and negative counts as zero", () => {
    expect(computeTotal(archery, { center: 1 })).toBe(5);
    expect(computeTotal(archery, { center: -3, board: 2 })).toBe(2);
  });

  it("ignores counts for unknown components", () => {
    expect(computeTotal(single, { goals: 1, other: 50 })).toBe(1);
  });
});

describe("describeTotal", () => {
  it("shows the arithmetic", () => {
    expect(describeTotal(archery, { center: 2, black: 3, board: 1 })).toBe("2×5 + 3×2 + 1×1 = 17");
  });
});
