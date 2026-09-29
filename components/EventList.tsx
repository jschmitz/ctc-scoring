import Link from "next/link";
import type { Event } from "@/lib/types";
import { SimulationBadge } from "./EventNav";
import { SimulateButton } from "./SimulateButton";

/**
 * Event cards with links to each view. Used by the public home page and the staff
 * /admin list; `staff` adds a Simulate button to real events.
 */
export function EventList({ events, staff = false }: { events: Event[]; staff?: boolean }) {
  if (events.length === 0) return <p className="mt-8 text-slate-600">No events yet.</p>;
  return (
    <ul className="mt-8 space-y-3">
      {events.map((e) => (
        <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-medium">
              {e.name}
              {e.is_simulation && <SimulationBadge />}
            </h2>
            <span className="text-sm text-slate-500">
              {e.event_date && `${e.event_date} · `}
              <span className="capitalize">{e.status}</span>
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
            {staff && !e.is_simulation && <SimulateButton eventId={e.id} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
