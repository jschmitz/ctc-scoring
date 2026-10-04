"use client";

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EventNav } from "@/components/EventNav";
import { TeamName } from "@/components/TeamName";
import { scoresToCsv } from "@/lib/csv";
import { roundCount } from "@/lib/rotation";
import { useEventData, type EventData } from "@/lib/useEventData";
import { ScoreForm } from "./ScoreForm";

type Selection = { teamId: string; challengeId: string };

export function ScoreTable({ eventId, staffEmail }: { eventId: string; staffEmail: string }) {
  const { data, error, reload, supabase } = useEventData(eventId);
  const [view, setView] = useState<"round" | "activity" | "table" | "progress">("round");
  const [round, setRound] = useState<number | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  if (error) return <p className="p-8 text-red-700">Couldn&apos;t load the event: {error}</p>;
  if (!data) return <p className="p-8 text-slate-500">Loading…</p>;

  const rounds = roundCount(data.slots);
  const shownRound = round ?? data.event.current_round;
  const shownChallengeId = challengeId ?? data.challenges[0]?.id ?? null;

  async function setCurrentRound(n: number) {
    await supabase.from("events").update({ current_round: n }).eq("id", eventId);
    reload();
  }

  function exportCsv() {
    const blob = new Blob([scoresToCsv(data!)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${data!.event.name.replace(/\W+/g, "-").toLowerCase()}-scores.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <EventNav eventId={eventId} eventName={data.event.name} active="score" simulation={data.event.is_simulation} />
      <main
        className={
          view === "table"
            ? "mx-auto w-full max-w-6xl px-4 py-6"
            : "mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_420px]"
        }
      >
        <section>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
              {(["round", "activity", "table", "progress"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1.5 ${view === v ? "bg-accent text-white" : "text-slate-600"}`}
                >
                  {{ round: "By round", activity: "By activity", table: "Table entry", progress: "All scores" }[v]}
                </button>
              ))}
            </div>
            <span className="text-sm text-slate-500">
              {data.scores.length} of {data.teams.length * data.challenges.length} scores entered
            </span>
            <button onClick={exportCsv} className="ml-auto rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
              Export CSV
            </button>
          </div>

          {view === "round" ? (
            <RoundView
              data={data}
              round={shownRound}
              rounds={rounds}
              selection={selection}
              supabase={supabase}
              reload={reload}
              onRound={(n) => {
                setRound(n);
                setSelection(null);
              }}
              onSetCurrent={setCurrentRound}
              onSelect={setSelection}
            />
          ) : view === "activity" ? (
            <ActivityView
              data={data}
              challengeId={shownChallengeId}
              selection={selection}
              onChallenge={(id) => {
                setChallengeId(id);
                setSelection(null);
              }}
              onSelect={setSelection}
            />
          ) : view === "table" ? (
            <TableView data={data} supabase={supabase} reload={reload} />
          ) : (
            <ProgressView data={data} selection={selection} onSelect={setSelection} />
          )}
        </section>

        {view !== "table" && (
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <ScoreForm
              key={selection ? `${selection.teamId}:${selection.challengeId}` : "none"}
              data={data}
              selection={selection}
              round={shownRound}
              staffEmail={staffEmail}
              supabase={supabase}
              onSelect={setSelection}
              onSaved={async (saved) => {
                await reload();
                setSelection(nextPending(data, shownRound, saved));
              }}
            />
          </aside>
        )}
      </main>
    </>
  );
}

/** After saving, jump to the next team in the round that still needs a score. */
function nextPending(data: EventData, round: number, saved: Selection): Selection | null {
  const inRound = data.slots.filter((s) => s.round_number === round);
  const scored = new Set(data.scores.map((s) => `${s.team_id}:${s.challenge_id}`));
  scored.add(`${saved.teamId}:${saved.challengeId}`);
  const next = inRound
    .map((s) => ({ slot: s, team: data.teams.find((t) => t.id === s.team_id)! }))
    .sort((a, b) => a.team.number - b.team.number)
    .find(({ slot }) => !scored.has(`${slot.team_id}:${slot.challenge_id}`));
  return next ? { teamId: next.slot.team_id, challengeId: next.slot.challenge_id } : null;
}

/**
 * Local edits for score cells, layered over the saved counts until a blur (or a tab
 * switch, which blurs the field first) commits them with save_score — so a quick batch
 * of entries can be typed straight in, and a realtime reload from someone else's save
 * mid-entry doesn't clobber a field still being typed. Shared by RoundView and TableView.
 */
function useInlineScores(data: EventData, supabase: SupabaseClient, reload: () => Promise<void>) {
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const scoreFor = (teamId: string, challengeId: string) => data.scores.find((s) => s.team_id === teamId && s.challenge_id === challengeId);
  const countFor = (teamId: string, challengeId: string, componentId: string) => {
    const key = `${teamId}:${componentId}`;
    if (key in edits) return edits[key];
    return scoreFor(teamId, challengeId)?.score_components.find((c) => c.component_id === componentId)?.count ?? 0;
  };
  const setCount = (teamId: string, componentId: string, value: number) =>
    setEdits((prev) => ({ ...prev, [`${teamId}:${componentId}`]: Math.max(0, Math.floor(value || 0)) }));

  async function save(teamId: string, challenge: EventData["challenges"][number]) {
    const keys = challenge.scoring_components.map((c) => `${teamId}:${c.id}`);
    if (!keys.some((k) => k in edits)) return; // nothing changed in this challenge's row
    const counts = Object.fromEntries(challenge.scoring_components.map((c) => [c.id, countFor(teamId, challenge.id, c.id)]));
    const { error } = await supabase.rpc("save_score", {
      p_team_id: teamId,
      p_challenge_id: challenge.id,
      p_counts: counts,
      p_notes: scoreFor(teamId, challenge.id)?.notes ?? "",
    });
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setEdits((prev) => {
      const next = { ...prev };
      for (const k of keys) delete next[k];
      return next;
    });
    await reload();
  }

  return { scoreFor, countFor, setCount, save, error };
}

/** Number inputs for one challenge's components, inline — the fast-entry half of a row. */
function InlineCounts({
  team,
  challenge,
  countFor,
  setCount,
  save,
}: {
  team: EventData["teams"][number];
  challenge: EventData["challenges"][number];
  countFor: ReturnType<typeof useInlineScores>["countFor"];
  setCount: ReturnType<typeof useInlineScores>["setCount"];
  save: ReturnType<typeof useInlineScores>["save"];
}) {
  const multi = challenge.scoring_components.length > 1;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
      {challenge.scoring_components.map((sc) => (
        <label key={sc.id} className="flex items-center gap-1 text-xs text-slate-500">
          {multi && <span className="hidden sm:inline">{sc.label}</span>}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={countFor(team.id, challenge.id, sc.id)}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setCount(team.id, sc.id, e.target.valueAsNumber)}
            onBlur={() => save(team.id, challenge)}
            aria-label={`${team.name}, ${challenge.name}, ${sc.label}`}
            className="w-14 rounded-md border border-slate-300 px-1.5 py-1 text-center text-sm tabular-nums focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </label>
      ))}
    </div>
  );
}

function RoundView({
  data,
  round,
  rounds,
  selection,
  supabase,
  reload,
  onRound,
  onSetCurrent,
  onSelect,
}: {
  data: EventData;
  round: number;
  rounds: number;
  selection: Selection | null;
  supabase: SupabaseClient;
  reload: () => Promise<void>;
  onRound: (n: number) => void;
  onSetCurrent: (n: number) => void;
  onSelect: (s: Selection) => void;
}) {
  const { countFor, setCount, save, error } = useInlineScores(data, supabase, reload);
  if (rounds === 0) {
    return (
      <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-slate-600">
        No rotation yet. Generate one in Setup, or use <b>All scores</b> to enter any team and challenge.
      </p>
    );
  }

  const rows = data.slots
    .filter((s) => s.round_number === round)
    .map((slot) => ({
      slot,
      team: data.teams.find((t) => t.id === slot.team_id)!,
      challenge: data.challenges.find((c) => c.id === slot.challenge_id)!,
      score: data.scores.find((s) => s.team_id === slot.team_id && s.challenge_id === slot.challenge_id),
    }))
    .sort((a, b) => a.team.number - b.team.number);
  const done = rows.filter((r) => r.score).length;
  const resting = data.teams.filter((t) => !rows.some((r) => r.team.id === t.id));
  const isCurrent = round === data.event.current_round;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={round <= 1}
          onClick={() => onRound(round - 1)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
          aria-label="Previous round"
        >
          ◀
        </button>
        <h2 className="min-w-40 text-center text-xl font-semibold">
          Round {round} <span className="font-normal text-slate-500">of {rounds}</span>
        </h2>
        <button
          disabled={round >= rounds}
          onClick={() => onRound(round + 1)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
          aria-label="Next round"
        >
          ▶
        </button>
        {isCurrent ? (
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-strong">Current round</span>
        ) : (
          <button onClick={() => onSetCurrent(round)} className="text-sm text-accent-strong underline">
            Make this the current round
          </button>
        )}
        <span className="ml-auto text-sm text-slate-500">
          {done}/{rows.length} entered
        </span>
      </div>

      <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {rows.map(({ slot, team, challenge, score }) => {
          const selected = selection?.teamId === slot.team_id && selection.challengeId === slot.challenge_id;
          return (
            <li key={slot.id} className={`flex items-center gap-3 px-4 py-2 ${selected ? "bg-accent-soft" : "hover:bg-slate-50"}`}>
              <button
                type="button"
                onClick={() => onSelect({ teamId: slot.team_id, challengeId: slot.challenge_id })}
                className="flex flex-1 items-center gap-4 text-left"
                title="Open in the full form (description, notes)"
              >
                <span className="w-10 font-mono text-slate-500">#{team.number}</span>
                <span className="flex-1">
                  <TeamName team={team} className="font-medium" />
                  <span className="block text-sm text-slate-500">{challenge.name}</span>
                </span>
              </button>
              <InlineCounts team={team} challenge={challenge} countFor={countFor} setCount={setCount} save={save} />
              {score ? (
                <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">{score.total} pts</span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">Pending</span>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {resting.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
          Resting this round:
          {resting.map((t) => (
            <TeamName key={t.id} team={t} />
          ))}</p>
      )}

      {isCurrent && done === rows.length && round < rounds && (
        <div className="mt-4 flex items-center justify-between rounded-lg bg-green-50 p-4 text-green-900">
          <span>All scores for round {round} are in.</span>
          <button
            onClick={() => {
              onSetCurrent(round + 1);
              onRound(round + 1);
            }}
            className="rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white"
          >
            Start round {round + 1}
          </button>
        </div>
      )}
    </div>
  );
}

/** One challenge (station) across every round — for staff stationed at a single activity all event. */
function ActivityView({
  data,
  challengeId,
  selection,
  onChallenge,
  onSelect,
}: {
  data: EventData;
  challengeId: string | null;
  selection: Selection | null;
  onChallenge: (id: string) => void;
  onSelect: (s: Selection) => void;
}) {
  const challenges = data.challenges;
  const idx = challenges.findIndex((c) => c.id === challengeId);
  const challenge = challenges[idx] ?? challenges[0];
  if (!challenge) {
    return <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-slate-600">No challenges yet.</p>;
  }

  const inRotation = data.slots.some((s) => s.challenge_id === challenge.id);
  const rows = (
    inRotation
      ? data.slots
          .filter((s) => s.challenge_id === challenge.id)
          .map((slot) => ({ round: slot.round_number as number | null, team: data.teams.find((t) => t.id === slot.team_id)! }))
          .sort((a, b) => a.round! - b.round! || a.team.number - b.team.number)
      : // Not every challenge is a rotation station (e.g. Trivia) — list every team instead.
        data.teams.map((team) => ({ round: null, team }))
  ).map((row) => ({ ...row, score: data.scores.find((s) => s.team_id === row.team.id && s.challenge_id === challenge.id) }));
  const done = rows.filter((r) => r.score).length;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={idx <= 0}
          onClick={() => onChallenge(challenges[idx - 1].id)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
          aria-label="Previous activity"
        >
          ◀
        </button>
        <h2 className="min-w-40 text-center text-xl font-semibold">{challenge.name}</h2>
        <button
          disabled={idx >= challenges.length - 1}
          onClick={() => onChallenge(challenges[idx + 1].id)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
          aria-label="Next activity"
        >
          ▶
        </button>
        <span className="ml-auto text-sm text-slate-500">
          {done}/{rows.length} entered
        </span>
      </div>

      {!inRotation && (
        <p className="mt-2 text-sm text-slate-500">Not part of the rotation, so every team is listed here (by team number).</p>
      )}

      <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {rows.map(({ round, team, score }) => {
          const selected = selection?.teamId === team.id && selection.challengeId === challenge.id;
          return (
            <li key={team.id}>
              <button
                onClick={() => onSelect({ teamId: team.id, challengeId: challenge.id })}
                className={`flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-slate-50 ${selected ? "bg-accent-soft" : ""}`}
              >
                {round !== null && <span className="w-16 text-slate-500">Round {round}</span>}
                <span className="w-10 font-mono text-slate-500">#{team.number}</span>
                <span className="flex-1">
                  <TeamName team={team} className="font-medium" />
                </span>
                {score ? (
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-sm font-medium text-green-800">{score.total} pts</span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-sm text-amber-800">Pending</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Every team × every scoring component, as a spreadsheet: type a count, tab or click to
 * the next cell, and it saves on blur (via save_score, same as the other views). A
 * challenge with several components (Archery, Toss and Go) gets one column per
 * component rather than a single ambiguous total.
 */
function TableView({ data, supabase, reload }: { data: EventData; supabase: SupabaseClient; reload: () => Promise<void> }) {
  const { countFor, setCount, save, error } = useInlineScores(data, supabase, reload);

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>
            <th rowSpan={2} className="sticky left-0 z-10 bg-slate-50 px-3 py-2 align-bottom">
              Team
            </th>
            {data.challenges.map((c) => (
              <th key={c.id} colSpan={c.scoring_components.length} className="border-l border-slate-200 px-3 py-2 text-center font-medium">
                {c.name}
              </th>
            ))}
          </tr>
          <tr>
            {data.challenges.flatMap((c) =>
              c.scoring_components.map((sc, i) => (
                <th key={sc.id} className={`px-2 py-1 text-center text-xs font-normal whitespace-nowrap text-slate-500 ${i === 0 ? "border-l border-slate-200" : ""}`}>
                  {sc.label} <span className="text-slate-400">({sc.points}pt)</span>
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.teams.map((t) => (
            <tr key={t.id}>
              <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2">
                <span className="font-mono text-slate-500">#{t.number}</span> <TeamName team={t} />
              </td>
              {data.challenges.flatMap((c) =>
                c.scoring_components.map((sc, i) => (
                  <td key={sc.id} className={`p-1 ${i === 0 ? "border-l border-slate-200" : ""}`}>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={countFor(t.id, c.id, sc.id)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setCount(t.id, sc.id, e.target.valueAsNumber)}
                      onBlur={() => save(t.id, c)}
                      className="w-16 rounded-md border border-slate-200 px-2 py-1 text-center tabular-nums focus:border-accent focus:ring-1 focus:ring-accent"
                      aria-label={`${t.name}, ${c.name}, ${sc.label}`}
                    />
                  </td>
                )),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="border-t border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function ProgressView({
  data,
  selection,
  onSelect,
}: {
  data: EventData;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
}) {
  const scoreMap = useMemo(() => new Map(data.scores.map((s) => [`${s.team_id}:${s.challenge_id}`, s])), [data.scores]);
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>
            <th className="px-3 py-2">Team</th>
            {data.challenges.map((c) => (
              <th key={c.id} className="px-3 py-2 text-center font-medium">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.teams.map((t) => (
            <tr key={t.id}>
              <td className="whitespace-nowrap px-3 py-2">
                <span className="font-mono text-slate-500">#{t.number}</span> <TeamName team={t} />
              </td>
              {data.challenges.map((c) => {
                const s = scoreMap.get(`${t.id}:${c.id}`);
                const selected = selection?.teamId === t.id && selection.challengeId === c.id;
                return (
                  <td key={c.id} className="p-1 text-center">
                    <button
                      onClick={() => onSelect({ teamId: t.id, challengeId: c.id })}
                      className={`w-full rounded-md px-2 py-1.5 ${
                        selected ? "ring-2 ring-accent" : ""
                      } ${s ? "bg-green-50 font-medium text-green-900" : "text-slate-400 hover:bg-slate-50"}`}
                    >
                      {s ? s.total : "—"}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
