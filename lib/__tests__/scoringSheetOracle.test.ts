import { describe, expect, it } from "vitest";
import { buildEnhancedLeaderboard } from "../enhancedScoring";
import { SCORING_SHEET_EXAMPLE } from "../scoringSheet";
import { seededRandom } from "../simulate";

/**
 * A deliberately literal transcription of the organizers' "CTC Scoring Sheet 2026"
 * formulas. It shares no code with lib/enhancedScoring.ts, so the app can be checked
 * against "what the spreadsheet would say".
 *
 *   Challenge tab, Rank:    =RANK(B4,$B$4:$B$15,0)
 *   Challenge tab, Points:  =IF(C4=1,12,(IF(C4=2,11, … (IF(C4=7,6,0)))))+IF(C4=8,5, … (IF(C4=12,1,0)))
 *   Challenge Standings:    =VLOOKUP(team, tab!$A$3:$D$15, 4, FALSE) per challenge, Total =SUM(B4:H4),
 *                           Tie Breaker Num of Wins =COUNTIF(B4:H4,12)
 *   Scoring Outline:        the most points wins; on a tie, the most first-place finishes wins.
 *
 * The sheet's points table is fixed for 12 teams (1st = 12). The organizers chose
 * "number of teams" for other team counts, so the table below is generated for N teams;
 * for N = 12 it is exactly the sheet's (checked by the first test).
 */

/** RANK(x, ref, 0): 1 + the number of values in ref greater than x. */
const RANK = (x: number, ref: number[]) => 1 + ref.filter((v) => v > x).length;

/** The sheet's nested IFs as a place → points table, generalized to N teams. */
const pointsTable = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, n - i])) as Record<number, number>;
const POINTS = (rank: number, n: number) => pointsTable(n)[rank] ?? 0;

type Sheet = { teams: string[]; challenges: string[]; scores: Record<string, Record<string, number>> };

/** Challenge Standings: total, tie-breaker wins, and the final order with places. */
function sheetStandings({ teams, challenges, scores }: Sheet) {
  const n = teams.length;
  const points = (team: string, challenge: string) => {
    const column = teams.map((t) => scores[challenge][t]);
    return POINTS(RANK(scores[challenge][team], column), n); // VLOOKUP(team, tab, 4) reads this
  };
  const rows = teams.map((team, i) => {
    const byChallenge = challenges.map((c) => points(team, c));
    return { team, i, total: byChallenge.reduce((a, b) => a + b, 0), wins: byChallenge.filter((p) => p === n).length };
  });
  const better = (a: (typeof rows)[number], b: (typeof rows)[number]) => a.total > b.total || (a.total === b.total && a.wins > b.wins);
  return rows
    .map((r) => {
      const place = 1 + rows.filter((o) => better(o, r)).length;
      const shared = rows.some((o) => o !== r && o.total === r.total && o.wins === r.wins);
      return [r.team, r.total, shared ? `T${place}` : String(place), r.i] as const;
    })
    .sort((a, b) => Number(a[2].replace("T", "")) - Number(b[2].replace("T", "")) || a[3] - b[3])
    .map(([team, total, place]) => [team, total, place]);
}

function appStandings({ teams, challenges, scores }: Sheet) {
  const board = buildEnhancedLeaderboard(
    teams.map((name, i) => ({ id: name, number: i + 1, name, color: "#000000" })),
    challenges.map((name) => ({ id: name, name })),
    Object.entries(scores).flatMap(([c, byTeam]) => Object.entries(byTeam).map(([t, total]) => ({ team_id: t, challenge_id: c, total }))),
  );
  return board.rows.map((r) => [r.team.name, r.total, r.tied ? `T${r.rank}` : String(r.rank)]);
}

/** A random complete event. Small score ranges make ties (including total ties) common. */
function randomSheet(random: () => number, teamCount: number, challengeCount: number): Sheet {
  const teams = Array.from({ length: teamCount }, (_, i) => `Team ${i + 1}`);
  const challenges = Array.from({ length: challengeCount }, (_, i) => `Challenge ${i}`);
  const range = 2 + Math.floor(random() * 10);
  const scores = Object.fromEntries(challenges.map((c) => [c, Object.fromEntries(teams.map((t) => [t, Math.floor(random() * range)]))]));
  return { teams, challenges, scores };
}

describe("spreadsheet oracle", () => {
  it("uses exactly the sheet's Place→Points table for 12 teams", () => {
    // Copied from the workbook's Scoring Outline tab (Place / Points, rows 2–13).
    expect(pointsTable(12)).toEqual({ 1: 12, 2: 11, 3: 10, 4: 9, 5: 8, 6: 7, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 });
  });

  it("agrees with the hand-checked scoring-sheet example", () => {
    expect(sheetStandings(SCORING_SHEET_EXAMPLE)).toEqual(SCORING_SHEET_EXAMPLE.expectedStandings);
  });

  it("matches the app on the scoring-sheet example", () => {
    expect(appStandings(SCORING_SHEET_EXAMPLE)).toEqual(sheetStandings(SCORING_SHEET_EXAMPLE));
  });

  it("matches the app on 5,000 random 12-team, 7-challenge events", () => {
    const random = seededRandom(20261017);
    let totalTies = 0;
    for (let i = 0; i < 5000; i++) {
      const sheet = randomSheet(random, 12, 7);
      const expected = sheetStandings(sheet);
      expect(appStandings(sheet)).toEqual(expected);
      if (new Set(expected.map((r) => r[1])).size < 12) totalTies++;
    }
    // Make sure the run really exercised the tiebreaker.
    expect(totalTies).toBeGreaterThan(1000);
  });

  it("matches the app for other team and challenge counts (2–16 teams)", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 2000; i++) {
      const sheet = randomSheet(random, 2 + Math.floor(random() * 15), 1 + Math.floor(random() * 8));
      expect(appStandings(sheet)).toEqual(sheetStandings(sheet));
    }
  });
});
