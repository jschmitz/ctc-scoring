"use client";

import { EventNav } from "@/components/EventNav";
import { TeamName } from "@/components/TeamName";
import { roundCount } from "@/lib/rotation";
import { useEventData } from "@/lib/useEventData";

export function Schedule({ eventId }: { eventId: string }) {
  const { data, error } = useEventData(eventId);

  if (error) return <p className="p-8 text-red-700">Couldn&apos;t load the event: {error}</p>;
  if (!data) return <p className="p-8 text-slate-500">Loading…</p>;

  const rounds = Array.from({ length: roundCount(data.slots) }, (_, i) => i + 1);
  const challengeName = (id: string) => data.challenges.find((c) => c.id === id)?.name ?? "?";
  const scored = new Set(data.scores.map((s) => `${s.team_id}:${s.challenge_id}`));

  return (
    <>
      <EventNav eventId={eventId} eventName={data.event.name} active="schedule" simulation={data.event.is_simulation} />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Rotation schedule</h1>
          <span className="text-slate-500">{data.event.name}</span>
          <button onClick={() => window.print()} className="no-print ml-auto rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
            Print
          </button>
        </div>

        {rounds.length === 0 ? (
          <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-slate-600">
            The rotation hasn&apos;t been generated yet.
          </p>
        ) : (
          <>
            <h2 className="mt-6 text-lg font-medium">By station</h2>
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Round</th>
                    {data.challenges.map((c) => (
                      <th key={c.id} className="px-3 py-2 font-medium">
                        {c.position}. {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rounds.map((r) => {
                    const current = r === data.event.current_round && data.event.status !== "final";
                    return (
                      <tr key={r} className={current ? "bg-accent-soft" : ""}>
                        <td className="whitespace-nowrap px-3 py-2 font-medium">
                          {r}
                          {current && <span className="ml-2 text-xs text-accent-strong">now</span>}
                        </td>
                        {data.challenges.map((c) => {
                          const here = data.slots.filter((s) => s.round_number === r && s.challenge_id === c.id);
                          return (
                            <td key={c.id} className="px-3 py-2">
                              {here.length === 0 ? (
                                <span className="text-slate-300">—</span>
                              ) : (
                                here.map((s) => (
                                  <div key={s.id} className={scored.has(`${s.team_id}:${s.challenge_id}`) ? "text-slate-400 line-through print:no-underline print:text-inherit" : ""}>
                                    <TeamName team={data.teams.find((t) => t.id === s.team_id) ?? { name: "?", color: "#94a3b8" }} />
                                  </div>
                                ))
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h2 className="mt-8 text-lg font-medium">By team</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
              {data.teams.map((t) => (
                <div key={t.id} className="break-inside-avoid rounded-xl border border-slate-200 bg-white p-4">
                  <div className="font-medium">
                    <span className="text-slate-500">#{t.number}</span> <TeamName team={t} />
                    {t.captain && <span className="ml-1 text-sm font-normal text-slate-500">· {t.captain}</span>}
                  </div>
                  <ol className="mt-2 space-y-0.5 text-sm">
                    {data.slots
                      .filter((s) => s.team_id === t.id)
                      .sort((a, b) => a.round_number - b.round_number)
                      .map((s) => (
                        <li key={s.id} className="flex gap-2">
                          <span className="w-16 text-slate-500">Round {s.round_number}</span>
                          <span>{challengeName(s.challenge_id)}</span>
                        </li>
                      ))}
                  </ol>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
