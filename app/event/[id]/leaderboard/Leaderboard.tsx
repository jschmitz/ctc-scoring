"use client";

import { useState } from "react";
import { EventNav } from "@/components/EventNav";
import { TeamName } from "@/components/TeamName";
import { buildLeaderboard } from "@/lib/leaderboard";
import { useEventData } from "@/lib/useEventData";

export function Leaderboard({ eventId }: { eventId: string }) {
  const { data, error } = useEventData(eventId);
  const [projector, setProjector] = useState(false);

  if (error) return <p className="p-8 text-red-700">Couldn&apos;t load the event: {error}</p>;
  if (!data) return <p className="p-8 text-slate-500">Loading…</p>;

  const rows = buildLeaderboard(data.teams, data.scores);
  const big = projector;

  function toggleProjector() {
    const next = !projector;
    setProjector(next);
    if (next) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  return (
    <>
      {!projector && <EventNav eventId={eventId} eventName={data.event.name} active="leaderboard" />}
      <main className={`mx-auto w-full px-4 py-6 ${big ? "max-w-none px-10" : "max-w-6xl"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={`font-semibold ${big ? "text-5xl" : "text-2xl"}`}>{big ? data.event.name : "Leaderboard"}</h1>
          <span className={`rounded-full bg-accent-soft px-3 py-1 font-medium text-accent-strong ${big ? "text-xl" : "text-sm"}`}>
            {data.event.status === "final" ? "Final" : `Round ${data.event.current_round}`}
          </span>
          <span className="flex items-center gap-1.5 text-sm text-slate-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" /> Live
          </span>
          <button onClick={toggleProjector} className="no-print ml-auto rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
            {projector ? "Exit projector mode" : "Projector mode"}
          </button>
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
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.team.id} className={r.rank === 1 && r.total > 0 ? "bg-accent-soft" : ""}>
                  <td className="px-4 py-3 text-center font-semibold tabular-nums">
                    {r.tied ? `T${r.rank}` : r.rank}
                  </td>
                  <td className="px-4 py-3">
                    <TeamName team={r.team} className="font-medium" />
                    <span className="ml-2 text-xs text-slate-400">
                      {r.completed}/{data.challenges.length} done
                    </span>
                  </td>
                  {data.challenges.map((c) => (
                    <td key={c.id} className="px-3 py-3 text-center tabular-nums text-slate-700">
                      {r.byChallenge[c.id] ?? <span className="text-slate-300">—</span>}
                    </td>
                  ))}
                  <td className={`px-4 py-3 text-right font-bold tabular-nums ${big ? "text-4xl" : "text-lg"}`}>{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="mt-4 text-slate-500">No teams yet.</p>}
      </main>
    </>
  );
}
