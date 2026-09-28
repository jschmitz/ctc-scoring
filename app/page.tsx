import Link from "next/link";
import { SiteHeader } from "@/components/EventNav";
import { createClient } from "@/lib/supabase/server";
import type { Event } from "@/lib/types";

export default async function Home() {
  const supabase = await createClient();
  const { data: events } = await supabase.from("events").select("*").order("event_date", { ascending: false });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-semibold">CTC Scoring</h1>
        <p className="mt-2 text-slate-600">Pick an event to see standings, the rotation schedule, or enter scores.</p>

        <ul className="mt-8 space-y-3">
          {(events as Event[] | null)?.map((e) => (
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

        <p className="mt-8 text-sm">
          <Link href="/admin" className="text-accent-strong underline">
            Create a new event
          </Link>
        </p>
      </main>
    </>
  );
}
