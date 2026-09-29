import Link from "next/link";
import { EventList } from "@/components/EventList";
import { SiteHeader } from "@/components/EventNav";
import { createClient } from "@/lib/supabase/server";
import type { Event } from "@/lib/types";

export default async function Home() {
  const supabase = await createClient();
  // Simulations are a staff tool (see /admin); keep them off the public list.
  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("is_simulation", false)
    .order("event_date", { ascending: false });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-semibold">CTC Scoring</h1>
        <p className="mt-2 text-slate-600">Pick an event to see standings, the rotation schedule, or enter scores.</p>

        <EventList events={(events as Event[] | null) ?? []} />

        <p className="mt-8 text-sm">
          <Link href="/admin/new" className="text-accent-strong underline">
            Create a new event
          </Link>
        </p>
      </main>
    </>
  );
}
