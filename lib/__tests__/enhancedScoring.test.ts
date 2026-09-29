import { describe, expect, it } from "vitest";
import { ENHANCED_EXAMPLES, type EnhancedExample } from "../enhancedScoring.examples";
import { buildEnhancedLeaderboard, ordinal, rankChallenge } from "../enhancedScoring";
import { seededRandom } from "../simulate";

/** Runs a worked example through the real calculation. Team numbers follow the example's team order. */
function run(example: EnhancedExample) {
  const teams = example.teams.map((name, i) => ({ id: name, number: i + 1, name, color: "#000000" }));
  const challenges = example.challenges.map((name) => ({ id: name, name }));
  const scores = Object.entries(example.scores).flatMap(([challenge, byTeam]) =>
    Object.entries(byTeam).map(([team, total]) => ({ team_id: team, challenge_id: challenge, total })),
  );
  return buildEnhancedLeaderboard(teams, challenges, scores);
}

describe.each(ENHANCED_EXAMPLES.map((e) => [e.title, e] as const))("worked example: %s", (_, example) => {
  const result = run(example);

  it("gives each team the hand-worked rank points in every challenge", () => {
    const actual = Object.fromEntries(
      Object.entries(result.placings).map(([challenge, placed]) => [challenge, Object.fromEntries(placed.map((p) => [p.teamId, p.points]))]),
    );
    expect(actual).toEqual(example.expectedPoints);
  });

  it("produces the hand-worked final standings", () => {
    expect(result.rows.map((r) => [r.team.name, r.total, r.tied ? `T${r.rank}` : String(r.rank)])).toEqual(example.expectedStandings);
  });
});

describe("rankChallenge", () => {
  it("matches the rule's own example: 12 teams, scores 20, 18, 18, 15 → 12, 11, 11, 9", () => {
    const placed = rankChallenge(12, [
      { team_id: "a", total: 20 },
      { team_id: "b", total: 18 },
      { team_id: "c", total: 18 },
      { team_id: "d", total: 15 },
    ]);
    expect(placed.map((p) => [p.teamId, p.points, p.tied])).toEqual([
      ["a", 12, false],
      ["b", 11, true],
      ["c", 11, true],
      ["d", 9, false],
    ]);
  });

  it("ranks a score of 0 like any other score", () => {
    const placed = rankChallenge(3, [
      { team_id: "a", total: 4 },
      { team_id: "b", total: 0 },
      { team_id: "c", total: 0 },
    ]);
    expect(placed.map((p) => p.points)).toEqual([3, 2, 2]);
  });

  it("agrees with an independently written ranking (sort, then first position of each score) on 2,000 random challenges", () => {
    const random = seededRandom(2026);
    for (let trial = 0; trial < 2000; trial++) {
      const teamCount = 2 + Math.floor(random() * 14);
      const scores = Array.from({ length: teamCount }, (_, i) => ({ team_id: `t${i}`, total: Math.floor(random() * 8) }));
      const sorted = scores.map((s) => s.total).sort((a, b) => b - a);
      const expected = Object.fromEntries(scores.map((s) => [s.team_id, teamCount - sorted.indexOf(s.total)]));
      const actual = Object.fromEntries(rankChallenge(teamCount, scores).map((p) => [p.teamId, p.points]));
      expect(actual).toEqual(expected);
    }
  });

  it("gives every challenge the same total points when all teams have played and nobody ties", () => {
    const placed = rankChallenge(12, Array.from({ length: 12 }, (_, i) => ({ team_id: `t${i}`, total: i * 3 })));
    expect(placed.reduce((sum, p) => sum + p.points, 0)).toBe((12 * 13) / 2);
  });
});

describe("explanations", () => {
  const notes = (id: string) => run(ENHANCED_EXAMPLES.find((e) => e.id === id)!).notes;

  it("explains a tie inside a challenge, including the skipped number", () => {
    expect(notes("basic")).toContainEqual({
      kind: "challenge-tie",
      text: "Archery: Blue and Green tied at 18, so each gets 4 points (tied teams get the higher number). 3 is skipped, so the next team gets 2 points.",
    });
  });

  it("explains when a team's place differs from raw totals", () => {
    expect(notes("margin").filter((n) => n.kind === "order-change").map((n) => n.text)).toEqual([
      "Blue is 1st with 7 points; on raw totals (31) it would be 2nd.",
      "Green is 2nd with 6 points; on raw totals (30) it would be 3rd.",
      "Red is 3rd with 5 points; on raw totals (51) it would be 1st.",
    ]);
  });

  it("explains a shared place on the final total", () => {
    expect(notes("final-tie")).toContainEqual({
      kind: "final-tie",
      text: "Red and Green are tied on 7 points and share 1st place. No tiebreaker has been set yet.",
    });
  });

  it("flags challenges that not every team has played", () => {
    expect(notes("in-progress")).toContainEqual({
      kind: "provisional",
      text: "Toss and Go: 3 of 4 teams have played, so its points are provisional and will shift as the rest finish.",
    });
  });

  it("says nothing when no rule changed anything", () => {
    const result = buildEnhancedLeaderboard(
      [
        { id: "a", number: 1, name: "A", color: "#000000" },
        { id: "b", number: 2, name: "B", color: "#000000" },
      ],
      [{ id: "x", name: "X" }],
      [
        { team_id: "a", challenge_id: "x", total: 5 },
        { team_id: "b", challenge_id: "x", total: 3 },
      ],
    );
    expect(result.notes).toEqual([]);
  });
});

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
  ])("%i → %s", (n, text) => expect(ordinal(n)).toBe(text));
});
