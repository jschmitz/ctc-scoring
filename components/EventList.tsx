import Link from "next/link";
import type { Event } from "@/lib/types";

/** Event cards with links to each view. Used by the public home page and the staff /admin list. */
export function EventList({ events }: { events: Event[] }) {
  if (events.length === 0) return <p className="mt-8 text-slate-600">No events yet.</p>;
  return (
    <ul className="mt-8 space-y-3">
      {events.map((e) => (
        <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-medium">{e.name}</h2>
            <span className="text-sm text-slate-500">
              {e.event_date} · <span className="capitalize">{e.status}</span>
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent-strong" href={`/event/${e.id}/leaderboard`}>
              Leaderboard
            </Link>
            <Link className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50" href={`/event/${e.id}/schedule`}>
              Schedule
            </Link>
            <Link className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50" href={`/score/${e.id}`}>
              Score table
            </Link>
            <Link className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50" href={`/admin/events/${e.id}`}>
              Setup
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
