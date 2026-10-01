import { buildLeaderboard, type LeaderboardRow, type LeaderboardScore, type LeaderboardTeam } from "./leaderboard";

/**
 * Enhanced scoring, as defined by the organizers' "CTC Scoring Sheet 2026" workbook.
 * Every challenge counts the same, and margin of victory doesn't matter.
 *
 * 1. Rank each challenge by raw score, highest first. The sheet uses
 *    `RANK(score, all scores, 0)`: tied teams share the best rank and the next rank is
 *    skipped ("if three teams tie for first place, they all get 12 points ... that team
 *    will drop down to fourth place and receive 9 points").
 * 2. Rank points: the sheet's Place→Points table gives 1st 12 points down to 12th 1 point
 *    (12 teams). The app uses number of teams + 1 − rank, which is that table with 12
 *    teams and scales with other team counts (organizers' decision).
 * 3. Total = the sum of rank points over every challenge (`SUM` in Challenge Standings).
 * 4. A tie on the total goes to the team with the most first-place finishes (sheet:
 *    "Tie Breaker Num of Wins" = `COUNTIF(points, 12)`, so shared firsts count).
 *
 * Equivalently, points = number of teams − number of teams that scored higher.
 *
 * The rules page (/scoring) explains this with worked examples that are also unit tests
 * (lib/enhancedScoring.examples.ts). lib/__tests__/scoringSheetOracle.test.ts checks
 * this code against a literal transcription of the workbook's formulas, and
 * lib/scoringSheetWorkbook.ts exports the workbook itself, filled with the app's raw
 * scores, so organizers can check results with their own formulas.
 */

/**
 * Cases the organizers' workbook doesn't settle. Each is implemented as described and
 * shown on the rules page as pending confirmation.
 */
export const ENHANCED_ASSUMPTIONS = [
  {
    id: "in-progress",
    question: "How are challenges ranked before every team has played them?",
    assumption:
      "The scoring sheet only works once every score is in (a blank score shows #N/A). The app ranks just the teams that have played, and a team that hasn't played gets 0 for that challenge. Points are provisional until every team has played, then they're the same as the sheet's.",
  },
  {
    id: "still-tied",
    question: "What if teams are tied on points and on first-place finishes?",
    assumption: "They share the place.",
  },
] as const;

export type ChallengePlacing = { teamId: string; raw: number; rank: number; points: number; tied: boolean };

/**
 * Rank points for one challenge. `rank` is 1 + the number of strictly higher scores
 * (the workbook's RANK(…, 0)), and `points` is teamCount + 1 − rank. Sorted best first,
 * ties by team id for stability.
 */
export function rankChallenge(teamCount: number, scores: { team_id: string; total: number }[]): ChallengePlacing[] {
  return scores
    .map((s) => {
      const rank = 1 + scores.filter((o) => o.total > s.total).length;
      return {
        teamId: s.team_id,
        raw: s.total,
        rank,
        points: teamCount + 1 - rank,
        tied: scores.some((o) => o !== s && o.total === s.total),
      };
    })
    .sort((a, b) => a.rank - b.rank || a.teamId.localeCompare(b.teamId));
}

export type EnhancedRow = LeaderboardRow & {
  /** byChallenge and total hold rank points; these hold the raw scores behind them. */
  rawByChallenge: Record<string, number | undefined>;
  rawTotal: number;
  /** Challenges this team placed 1st in (shared firsts count): the tiebreaker. */
  firstPlaces: number;
  /** Where the team would place under standard (raw total) scoring. */
  standardRank: number;
  standardTied: boolean;
};

export type EnhancedNote = {
  kind: "challenge-tie" | "provisional" | "order-change" | "tiebreak" | "final-tie";
  text: string;
};

export type EnhancedLeaderboard = {
  rows: EnhancedRow[];
  placings: Record<string, ChallengePlacing[]>;
  notes: EnhancedNote[];
};

export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const pts = (n: number) => `${n} point${n === 1 ? "" : "s"}`;
const firsts = (n: number) => `${n} first-place finish${n === 1 ? "" : "es"}`;

/**
 * Orders teams by total, then first-place finishes, and assigns places. Teams share a
 * place only when both are equal. Within a shared place they're listed by team number.
 */
function rankRows(rows: EnhancedRow[]): EnhancedRow[] {
  const same = (a: EnhancedRow, b: EnhancedRow) => a.total === b.total && a.firstPlaces === b.firstPlaces;
  const sorted = [...rows].sort((a, b) => b.total - a.total || b.firstPlaces - a.firstPlaces || a.team.number - b.team.number);
  sorted.forEach((row, i) => {
    row.rank = i > 0 && same(sorted[i - 1], row) ? sorted[i - 1].rank : i + 1;
  });
  for (const row of sorted) row.tied = sorted.some((o) => o !== row && same(o, row));
  return sorted;
}

/**
 * The enhanced leaderboard, plus plain-language notes for every place the rules
 * changed something: ties within a challenge, provisional challenges, teams whose
 * place differs from the raw-total standings, ties on the total settled by the
 * tiebreaker, and places still shared after it.
 */
export function buildEnhancedLeaderboard(
  teams: LeaderboardTeam[],
  challenges: { id: string; name: string }[],
  scores: LeaderboardScore[],
): EnhancedLeaderboard {
  const teamCount = teams.length;
  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? "Unknown team";
  const byTeamNumber = (a: ChallengePlacing, b: ChallengePlacing) =>
    (teams.find((t) => t.id === a.teamId)?.number ?? 0) - (teams.find((t) => t.id === b.teamId)?.number ?? 0);
  const placings: Record<string, ChallengePlacing[]> = {};
  const pointScores: LeaderboardScore[] = [];
  const notes: EnhancedNote[] = [];

  for (const c of challenges) {
    const inChallenge = scores.filter((s) => s.challenge_id === c.id && teams.some((t) => t.id === s.team_id));
    const placed = rankChallenge(teamCount, inChallenge);
    placings[c.id] = placed;
    for (const p of placed) pointScores.push({ team_id: p.teamId, challenge_id: c.id, total: p.points });

    for (const rank of [...new Set(placed.filter((p) => p.tied).map((p) => p.rank))]) {
      const group = placed.filter((p) => p.rank === rank).sort(byTeamNumber);
      const next = placed.find((p) => p.rank > rank);
      const skipped = Array.from({ length: group.length - 1 }, (_, i) => group[0].points - 1 - i);
      notes.push({
        kind: "challenge-tie",
        text:
          `${c.name}: ${listNames(group.map((p) => name(p.teamId)))} tied at ${group[0].raw}, so each gets ${pts(group[0].points)} (tied teams get the higher number).` +
          (next ? ` ${skipped.join(" and ")} ${skipped.length === 1 ? "is" : "are"} skipped, so the next team gets ${pts(next.points)}.` : ""),
      });
    }
    if (placed.length > 0 && placed.length < teamCount) {
      notes.push({
        kind: "provisional",
        text: `${c.name}: ${placed.length} of ${teamCount} teams have played, so its points are provisional and will shift as the rest finish.`,
      });
    }
  }

  const standard = buildLeaderboard(teams, scores);
  const rows = rankRows(
    buildLeaderboard(teams, pointScores).map((row) => {
      const std = standard.find((s) => s.team.id === row.team.id)!;
      return {
        ...row,
        rawByChallenge: std.byChallenge,
        rawTotal: std.total,
        firstPlaces: Object.values(placings).filter((placed) => placed.some((p) => p.teamId === row.team.id && p.rank === 1)).length,
        standardRank: std.rank,
        standardTied: std.tied,
      };
    }),
  );

  if (rows.some((r) => r.completed > 0)) {
    for (const r of rows) {
      if (r.rank !== r.standardRank) {
        notes.push({
          kind: "order-change",
          text: `${r.team.name} is ${r.tied ? "tied " : ""}${ordinal(r.rank)} with ${pts(r.total)}; on raw totals (${r.rawTotal}) it would be ${r.standardTied ? "tied " : ""}${ordinal(r.standardRank)}.`,
        });
      }
    }
    for (const total of [...new Set(rows.filter((r) => r.total > 0).map((r) => r.total))]) {
      const group = rows.filter((r) => r.total === total);
      if (group.length < 2) continue;
      if (new Set(group.map((r) => r.firstPlaces)).size > 1) {
        notes.push({
          kind: "tiebreak",
          text:
            `${listNames(group.map((r) => r.team.name))} are tied on ${pts(total)}, so the tiebreaker (most first-place finishes) decides: ` +
            group.map((r) => `${r.team.name} ${r.tied ? "tied " : ""}${ordinal(r.rank)} with ${firsts(r.firstPlaces)}`).join(", ") +
            ".",
        });
      }
      for (const rank of [...new Set(group.filter((r) => r.tied).map((r) => r.rank))]) {
        const shared = group.filter((r) => r.rank === rank);
        notes.push({
          kind: "final-tie",
          text: `${listNames(shared.map((r) => r.team.name))} are tied on ${pts(total)} and on ${firsts(shared[0].firstPlaces)}, so they share ${ordinal(rank)} place.`,
        });
      }
    }
  }

  return { rows, placings, notes };
}
