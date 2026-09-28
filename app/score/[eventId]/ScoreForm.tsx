"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeTotal, describeTotal, type Counts } from "@/lib/scoring";
import { colorName } from "@/lib/teamColors";
import type { EventData } from "@/lib/useEventData";
import { ColorDot } from "@/components/TeamName";

type Selection = { teamId: string; challengeId: string };

export function ScoreForm({
  data,
  selection,
  staffEmail,
  supabase,
  onSelect,
  onSaved,
}: {
  data: EventData;
  selection: Selection | null;
  staffEmail: string;
  supabase: SupabaseClient;
  onSelect: (s: Selection | null) => void;
  onSaved: (s: Selection) => void;
}) {
  const team = data.teams.find((t) => t.id === selection?.teamId);
  const challenge = data.challenges.find((c) => c.id === selection?.challengeId);
  const existing = data.scores.find((s) => s.team_id === team?.id && s.challenge_id === challenge?.id);
  const slot = data.slots.find((s) => s.team_id === team?.id && s.challenge_id === challenge?.id);
  // Only new entries are checked; corrections to earlier rounds are expected.
  const offSchedule = !existing && !!slot && slot.round_number !== data.event.current_round;

  const [counts, setCounts] = useState<Counts>(() =>
    Object.fromEntries(existing?.score_components.map((c) => [c.component_id, c.count]) ?? []),
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const components = challenge?.scoring_components ?? [];
  const total = computeTotal(components, counts);

  function setCount(id: string, value: number) {
    setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(999, Number.isFinite(value) ? Math.floor(value) : 0)) }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!team || !challenge) return;
    if (
      offSchedule &&
      !window.confirm(
        `The schedule has ${team.name} at ${challenge.name} in round ${slot!.round_number}, not round ${data.event.current_round}. Save anyway?`,
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    const { error } = await supabase.rpc("save_score", {
      p_team_id: team.id,
      p_challenge_id: challenge.id,
      p_counts: Object.fromEntries(components.map((c) => [c.id, counts[c.id] ?? 0])),
      p_notes: notes,
    });
    setSaving(false);
    if (error) setError(error.message);
    else onSaved({ teamId: team.id, challengeId: challenge.id });
  }

  const selectClass = "w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm";

  return (
    <form onSubmit={save} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-slate-500">
          Team
          <select
            className={selectClass}
            value={team?.id ?? ""}
            onChange={(e) => onSelect({ teamId: e.target.value, challengeId: challenge?.id ?? data.challenges[0]?.id })}
          >
            <option value="" disabled>
              Choose…
            </option>
            {data.teams.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.number} {t.name}
                {colorName(t.color) && ` (${colorName(t.color)})`}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">
          Challenge
          <select
            className={selectClass}
            value={challenge?.id ?? ""}
            onChange={(e) => onSelect({ teamId: team?.id ?? data.teams[0]?.id, challengeId: e.target.value })}
          >
            <option value="" disabled>
              Choose…
            </option>
            {data.challenges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.position}. {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!team || !challenge ? (
        <p className="mt-6 text-sm text-slate-500">Pick a team from the list, or choose a team and challenge above.</p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3 rounded-lg px-3 py-2" style={{ backgroundColor: `${team.color}1a` }}>
            <ColorDot color={team.color} size="h-6 w-6" />
            <div>
              <div className="font-semibold">{team.name}</div>
              <div className="text-sm text-slate-600">{challenge.name}</div>
            </div>
          </div>
          {challenge.description && <p className="mt-3 text-sm text-slate-600">{challenge.description}</p>}

          {existing && (
            <p className="mt-3 rounded-md bg-blue-50 p-2.5 text-sm text-blue-900">
              Already entered: <b>{existing.total} pts</b>
              {existing.entered_by && <> by {existing.entered_by}</>} at{" "}
              {new Date(existing.updated_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Saving will replace it.
            </p>
          )}
          {offSchedule && (
            <p className="mt-3 rounded-md bg-amber-50 p-2.5 text-sm text-amber-900">
              Scheduled for round {slot!.round_number}; the current round is {data.event.current_round}.
            </p>
          )}

          <div className="mt-4 space-y-3">
            {components.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-slate-500">
                    {c.points} {c.points === 1 ? "point" : "points"} each
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCount(c.id, (counts[c.id] ?? 0) - 1)}
                  className="h-12 w-12 rounded-lg border border-slate-300 text-2xl hover:bg-slate-50"
                  aria-label={`One fewer ${c.label}`}
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  autoFocus={i === 0}
                  value={counts[c.id] ?? 0}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setCount(c.id, e.target.valueAsNumber)}
                  className="h-12 w-20 rounded-lg border border-slate-300 text-center text-2xl font-semibold tabular-nums"
                  aria-label={c.label}
                />
                <button
                  type="button"
                  onClick={() => setCount(c.id, (counts[c.id] ?? 0) + 1)}
                  className="h-12 w-12 rounded-lg border border-slate-300 text-2xl hover:bg-slate-50"
                  aria-label={`One more ${c.label}`}
                >
                  +
                </button>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-baseline justify-between border-t border-slate-200 pt-4">
            <span className="text-sm text-slate-500">{components.length > 1 && describeTotal(components, counts)}</span>
            <span className="text-3xl font-semibold tabular-nums">
              {total} <span className="text-base font-normal text-slate-500">pts</span>
            </span>
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />

          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

          <button
            disabled={saving}
            className="mt-4 w-full rounded-lg bg-accent py-3 text-lg font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
          >
            {saving ? "Saving…" : existing ? "Update score" : "Save score"}
          </button>
          <p className="mt-2 text-center text-xs text-slate-400">Signed in as {staffEmail}</p>
        </>
      )}
    </form>
  );
}
