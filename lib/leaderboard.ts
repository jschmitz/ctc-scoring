export type LeaderboardTeam = { id: string; number: number; name: string; color: string };
export type LeaderboardScore = { team_id: string; challenge_id: string; total: number };

export type LeaderboardRow = {
  team: LeaderboardTeam;
  rank: number;
  tied: boolean;
  total: number;
  completed: number;
  byChallenge: Record<string, number | undefined>;
};

/** Ranks teams by the sum of raw points. Tied teams share a rank and are listed by team number. */
export function buildLeaderboard(
  teams: LeaderboardTeam[],
  scores: LeaderboardScore[],
): LeaderboardRow[] {
  const rows = teams.map((team) => {
    const byChallenge: Record<string, number | undefined> = {};
    for (const s of scores) if (s.team_id === team.id) byChallenge[s.challenge_id] = s.total;
    const values = Object.values(byChallenge) as number[];
    return {
      team,
      rank: 0,
      tied: false,
      total: values.reduce((a, b) => a + b, 0),
      completed: values.length,
      byChallenge,
    };
  });

  rows.sort((a, b) => b.total - a.total || a.team.number - b.team.number);
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.rank = prev && prev.total === row.total ? prev.rank : i + 1;
  });
  for (const row of rows) row.tied = rows.filter((r) => r.total === row.total).length > 1;
  return rows;
}
