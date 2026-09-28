import { describe, expect, it } from "vitest";
import { buildLeaderboard } from "../leaderboard";

const teams = [
  { id: "a", number: 1, name: "Alpha", color: "#dc2626" },
  { id: "b", number: 2, name: "Bravo", color: "#dc2626" },
  { id: "c", number: 3, name: "Charlie", color: "#dc2626" },
  { id: "d", number: 4, name: "Delta", color: "#dc2626" },
];

describe("buildLeaderboard", () => {
  const rows = buildLeaderboard(teams, [
    { team_id: "a", challenge_id: "x", total: 10 },
    { team_id: "a", challenge_id: "y", total: 5 },
    { team_id: "b", challenge_id: "x", total: 20 },
    { team_id: "c", challenge_id: "x", total: 15 },
  ]);

  it("ranks by summed raw points", () => {
    expect(rows.map((r) => [r.team.name, r.total, r.rank])).toEqual([
      ["Bravo", 20, 1],
      ["Alpha", 15, 2],
      ["Charlie", 15, 2],
      ["Delta", 0, 4],
    ]);
  });

  it("flags ties", () => {
    expect(rows.filter((r) => r.tied).map((r) => r.team.name)).toEqual(["Alpha", "Charlie"]);
  });

  it("tracks per-challenge scores and completion", () => {
    const alpha = rows.find((r) => r.team.id === "a")!;
    expect(alpha.byChallenge).toEqual({ x: 10, y: 5 });
    expect(alpha.completed).toBe(2);
    expect(rows.find((r) => r.team.id === "d")!.completed).toBe(0);
  });
});
