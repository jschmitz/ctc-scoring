"use client";

import { useState } from "react";
import Link from "next/link";
import { EventNav, SimulationBadge } from "@/components/EventNav";
import { TeamName } from "@/components/TeamName";
import { buildEnhancedLeaderboard, type EnhancedNote, type EnhancedRow } from "@/lib/enhancedScoring";
import { enhancedVerificationCsv } from "@/lib/enhancedVerification";
import { buildLeaderboard, type LeaderboardRow } from "@/lib/leaderboard";
import { useEventData } from "@/lib/useEventData";

const NOTE_LABELS: Record<EnhancedNote["kind"], string> = {
  "challenge-tie": "Tie in a challenge",
  provisional: "Not everyone has played",
  "order-change": "Different from raw totals",
  "final-tie": "Shared place",
};

export function Leaderboard({ eventId }: { eventId: string }) {
  const { data, error } = useEventData(eventId);
  const [projector, setProjector] = useState(false);

  if (error) return <p className="p-8 text-red-700">Couldn&apos;t load the event: {error}</p>;
  if (!data) return <p className="p-8 text-slate-500">Loading…</p>;

  const enhanced = data.event.scoring_mode === "enhanced";
  const board = enhanced ? buildEnhancedLeaderboard(data.teams, data.challenges, data.scores) : null;
  const rows: (LeaderboardRow | EnhancedRow)[] = board ? board.rows : buildLeaderboard(data.teams, data.scores);
  const big = projector;

  function toggleProjector() {
    const next = !projector;
    setProjector(next);
    if (next) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  function downloadVerification() {
    const csv = enhancedVerificationCsv(data!.event.name, data!.challenges, board!);
    // The byte-order mark makes Excel read the file as UTF-8 (team names, the "−" in the notes).
    const blob = new Blob(["﻿", csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${data!.event.name.replace(/\W+/g, "-").replace(/^-|-$/g, "").toLowerCase()}-enhanced-verification.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      {!projector && <EventNav eventId={eventId} eventName={data.event.name} active="leaderboard" simulation={data.event.is_simulation} />}
      <main className={`mx-auto w-full px-4 py-6 ${big ? "max-w-none px-10" : "max-w-6xl"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={`font-semibold ${big ? "text-5xl" : "text-2xl"}`}>{big ? data.event.name : "Leaderboard"}</h1>
          {projector && data.event.is_simulation && <SimulationBadge className="text-lg" />}
          <span className={`rounded-full bg-accent-soft px-3 py-1 font-medium text-accent-strong ${big ? "text-xl" : "text-sm"}`}>
            {data.event.status === "final" ? "Final" : `Round ${data.event.current_round}`}
          </span>
          {enhanced && (
            <Link
              href="/scoring"
              className={`rounded-full border border-gold px-3 py-1 font-medium text-accent-strong hover:bg-gold/10 ${big ? "text-xl" : "text-sm"}`}
            >
              Enhanced scoring{!big && " · how it works"}
            </Link>
          )}
          <span className="flex items-center gap-1.5 text-sm text-slate-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" /> Live
          </span>
          <div className="no-print ml-auto flex flex-wrap gap-2">
            {enhanced && !projector && (
              <button
                onClick={downloadVerification}
                title="A spreadsheet that recomputes these standings from the raw scores with its own formulas and checks them against the app"
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Download verification sheet
              </button>
            )}
            <button onClick={toggleProjector} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
              {projector ? "Exit projector mode" : "Projector mode"}
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className={`w-full ${big ? "text-2xl" : "text-sm"}`}>
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="w-16 px-4 py-3 text-center">#</th>
                <th className="px-4 py-3">Team</th>
                {data.challenges.map((c) => (
                  <th key={c.id} className={`px-3 py-3 text-center font-medium ${big ? "text-lg" : ""}`}>
                    {c.name}
                  </th>
                ))}
                <th className="px-4 py-3 text-right">{enhanced ? "Points" : "Total"}</th>
              </tr>
              {enhanced && (
                <tr>
                  <th />
                  <th />
                  <th colSpan={data.challenges.length + 1} className="px-3 pb-2 text-center text-xs font-normal text-slate-500">
                    Rank points, with the raw score in grey
                  </th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const e = board ? (r as EnhancedRow) : null;
                return (
                  <tr key={r.team.id} className={r.rank === 1 && r.total > 0 ? "bg-accent-soft" : ""}>
                    <td className="px-4 py-3 text-center font-semibold tabular-nums">{r.tied ? `T${r.rank}` : r.rank}</td>
                    <td className="px-4 py-3">
                      <TeamName team={r.team} className="font-medium" />
                      <span className="ml-2 text-xs text-slate-400">
                        {r.completed}/{data.challenges.length} done
                      </span>
                    </td>
                    {data.challenges.map((c) => {
                      const value = r.byChallenge[c.id];
                      if (value === undefined)
                        return (
                          <td key={c.id} className="px-3 py-3 text-center">
                            <span className="text-slate-300">—</span>
                          </td>
                        );
                      if (!e) return <td key={c.id} className="px-3 py-3 text-center tabular-nums text-slate-700">{value}</td>;
                      const placing = board!.placings[c.id]?.find((p) => p.teamId === r.team.id);
                      return (
                        <td
                          key={c.id}
                          className="px-3 py-3 text-center tabular-nums text-slate-700"
                          title={placing ? `Raw score ${placing.raw} · ${placing.tied ? "tied " : ""}rank ${placing.rank} · ${placing.points} points` : undefined}
                        >
                          <span className="font-semibold">{value}</span>
                          <span className={`ml-1 text-slate-400 ${big ? "text-base" : "text-xs"}`}>({e.rawByChallenge[c.id]})</span>
                        </td>
                      );
                    })}
                    <td className={`px-4 py-3 text-right font-bold tabular-nums ${big ? "text-4xl" : "text-lg"}`}>
                      {r.total}
                      {e && <span className={`block font-normal text-slate-400 ${big ? "text-base" : "text-xs"}`}>raw {e.rawTotal}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="mt-4 text-slate-500">No teams yet.</p>}

        {board && board.notes.length > 0 && (
          <section className={`mt-6 rounded-xl border border-gold/60 bg-white p-5 ${big ? "text-xl" : "text-sm"}`}>
            <h2 className={`font-semibold ${big ? "text-2xl" : "text-base"}`}>How enhanced scoring shaped these standings</h2>
            <ul className="mt-3 space-y-2">
              {board.notes.map((n, i) => (
                <li key={i} className="flex flex-wrap gap-x-2">
                  <span className="font-medium text-accent-strong">{NOTE_LABELS[n.kind]}:</span>
                  <span className="text-slate-700">{n.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
