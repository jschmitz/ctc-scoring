import type { EventData } from "./useEventData";

function cell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per entered score, with the per-component counts spelled out. */
export function scoresToCsv({ challenges, teams, scores }: Pick<EventData, "challenges" | "teams" | "scores">): string {
  const header = ["Team #", "Team", "Challenge", "Breakdown", "Total", "Notes", "Entered by", "Updated at"];
  const rows = scores
    .map((s) => {
      const team = teams.find((t) => t.id === s.team_id);
      const challenge = challenges.find((c) => c.id === s.challenge_id);
      const breakdown = (challenge?.scoring_components ?? [])
        .map((c) => `${c.label}: ${s.score_components.find((sc) => sc.component_id === c.id)?.count ?? 0}`)
        .join("; ");
      return {
        sort: [team?.number ?? 0, challenge?.position ?? 0],
        values: [team?.number ?? "", team?.name ?? "", challenge?.name ?? "", breakdown, s.total, s.notes, s.entered_by ?? "", s.updated_at],
      };
    })
    .sort((a, b) => a.sort[0] - b.sort[0] || a.sort[1] - b.sort[1]);
  return [header, ...rows.map((r) => r.values)].map((r) => r.map(cell).join(",")).join("\n");
}
