import { buildLeaderboard, type LeaderboardRow, type LeaderboardScore, type LeaderboardTeam } from "./leaderboard";

/**
 * Enhanced scoring: every challenge counts the same, and margin of victory doesn't matter.
 *
 * 1. Within each challenge, teams are ranked by raw score, highest first.
 * 2. Each team gets rank points: first place gets as many points as there are teams
 *    (confirmed by the organizers: 12 teams → 12 for first), down to 1 for last. Tied teams both get the higher number, and the next number
 *    is skipped (scores 20, 18, 18, 15 with 12 teams → 12, 11, 11, 9).
 * 3. A team's enhanced total is the sum of its rank points; the highest total wins.
 *
 * Equivalently, points = number of teams − number of teams that scored higher. Tied
 * teams have the same number of teams above them, which is what gives them the same
 * points and skips the next number. The verification export (lib/enhancedVerification.ts)
 * recomputes it that way with COUNTIF, independently of this code. The rules page (/scoring) explains all of this with worked examples
 * that are also the unit tests (lib/enhancedScoring.examples.ts).
 */

/**
 * Decisions the known rules don't settle yet. Each is implemented as described and
 * shown on the rules page as pending confirmation. Change it here (and in the
 * matching example/test) once the spreadsheet settles it.
 */
export const ENHANCED_ASSUMPTIONS = [
  {
    id: "in-progress",
    question: "How are challenges ranked before every team has played them?",
    assumption:
      "Only teams that have a score are ranked, and a team that hasn't played gets 0 for that challenge. Points are provisional until every team has played, and are final once they have.",
  },
  {
    id: "final-ties",
    question: "What happens if teams tie on enhanced total?",
    assumption: "They share the place. No tiebreaker is applied yet.",
  },
  {
    id: "zero-scores",
    question: "Does a score of 0 still earn rank points?",
    assumption: "Yes. A 0 is ranked like any other score (typically last, so 1 point, or shared if several teams scored 0).",
  },
] as const;

export type ChallengePlacing = { teamId: string; raw: number; rank: number; points: number; tied: boolean };

/**
 * Rank points for one challenge. `rank` is 1 + the number of strictly higher scores
 * (standard competition ranking, same as Excel's RANK.EQ), and `points` is
 * teamCount + 1 − rank, i.e. teamCount − the number of strictly higher scores. Sorted best first, ties by team id for stability.
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
  /** Where the team would place under standard (raw total) scoring. */
  standardRank: number;
  standardTied: boolean;
};

export type EnhancedNote = { kind: "challenge-tie" | "provisional" | "order-change" | "final-tie"; text: string };

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

/**
 * The enhanced leaderboard, plus plain-language notes for every place the rules
 * changed something: ties within a challenge, provisional challenges, teams whose
 * place differs from the raw-total standings, and ties on the final total.
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
  const rows: EnhancedRow[] = buildLeaderboard(teams, pointScores).map((row) => {
    const std = standard.find((s) => s.team.id === row.team.id)!;
    return { ...row, rawByChallenge: std.byChallenge, rawTotal: std.total, standardRank: std.rank, standardTied: std.tied };
  });

  const played = rows.some((r) => r.completed > 0);
  if (played) {
    for (const r of rows) {
      if (r.rank !== r.standardRank) {
        notes.push({
          kind: "order-change",
          text: `${r.team.name} is ${r.tied ? "tied " : ""}${ordinal(r.rank)} with ${pts(r.total)}; on raw totals (${r.rawTotal}) it would be ${r.standardTied ? "tied " : ""}${ordinal(r.standardRank)}.`,
        });
      }
    }
    for (const rank of [...new Set(rows.filter((r) => r.tied && r.total > 0).map((r) => r.rank))]) {
      const group = rows.filter((r) => r.rank === rank);
      notes.push({
        kind: "final-tie",
        text: `${listNames(group.map((r) => r.team.name))} are tied on ${pts(group[0].total)} and share ${ordinal(rank)} place. No tiebreaker has been set yet.`,
      });
    }
  }

  return { rows, placings, notes };
}
