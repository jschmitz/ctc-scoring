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
