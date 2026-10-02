export type RotationSlot = {
  round_number: number;
  team_id: string;
  challenge_id: string;
};

/**
 * Cyclic rotation with byes: every team visits every challenge exactly once.
 *
 * Teams are split into G = ceil(N / teamsPerStation) groups that move together.
 * With R = max(C, G) positions — C stations plus R - C rest spots — group g sits at
 * position (g + r) mod R in round r. Each group passes through every position once,
 * so the event takes R rounds and no station ever holds more than one group.
 */
export function generateRotation(
  teamIds: string[],
  challengeIds: string[],
  teamsPerStation = 1,
): RotationSlot[] {
  const c = challengeIds.length;
  if (c === 0 || teamIds.length === 0) return [];
  const groups = Math.ceil(teamIds.length / Math.max(1, teamsPerStation));
  const positions = Math.max(c, groups);

  return teamIds.flatMap((teamId, index) => {
    const group = index % groups;
    const slots: RotationSlot[] = [];
    for (let r = 0; r < positions; r++) {
      const position = (group + r) % positions;
      if (position < c) slots.push({ round_number: r + 1, team_id: teamId, challenge_id: challengeIds[position] });
    }
    return slots;
  });
}

export function roundCount(slots: RotationSlot[]): number {
  return slots.reduce((max, s) => Math.max(max, s.round_number), 0);
}

/**
 * Puts a team at a challenge (or resting, when challengeId is null) in one round.
 * If the team already visits that challenge in another round, the two rounds swap,
 * so an edit never gives a team the same challenge twice.
 */
export function assignSlot(
  slots: RotationSlot[],
  teamId: string,
  round: number,
  challengeId: string | null,
): RotationSlot[] {
  const current = slots.find((s) => s.team_id === teamId && s.round_number === round)?.challenge_id ?? null;
  const other = challengeId && slots.find((s) => s.team_id === teamId && s.challenge_id === challengeId && s.round_number !== round);
  const rest = slots.filter((s) => s.team_id !== teamId || (s.round_number !== round && s !== other));
  if (challengeId) rest.push({ round_number: round, team_id: teamId, challenge_id: challengeId });
  if (other && current) rest.push({ round_number: other.round_number, team_id: teamId, challenge_id: current });
  return rest;
}

export type RotationIssues = {
  /** `${round}:${challengeId}` for every station holding more teams than it can. */
  overloaded: Set<string>;
  /** Challenge ids each team never visits, keyed by team id. */
  missing: Map<string, string[]>;
};

export function rotationIssues(
  slots: RotationSlot[],
  teamIds: string[],
  challengeIds: string[],
  teamsPerStation = 1,
): RotationIssues {
  const load = new Map<string, number>();
  for (const s of slots) {
    const key = `${s.round_number}:${s.challenge_id}`;
    load.set(key, (load.get(key) ?? 0) + 1);
  }
  const overloaded = new Set([...load].filter(([, n]) => n > Math.max(1, teamsPerStation)).map(([key]) => key));
  const missing = new Map<string, string[]>();
  for (const t of teamIds) {
    const visited = new Set(slots.filter((s) => s.team_id === t).map((s) => s.challenge_id));
    const gaps = challengeIds.filter((c) => !visited.has(c));
    if (gaps.length > 0) missing.set(t, gaps);
  }
  return { overloaded, missing };
}
