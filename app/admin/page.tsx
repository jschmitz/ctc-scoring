import Link from "next/link";
import { EventList } from "@/components/EventList";
import { SiteHeader } from "@/components/EventNav";
import { NotStaff } from "@/components/NotStaff";
import { primaryButton } from "@/components/ui";
import { requireStaff } from "@/lib/requireStaff";
import { createClient } from "@/lib/supabase/server";
import type { Event } from "@/lib/types";

// Where staff land after signing in: every event, plus a way to start a new one.
export default async function AdminPage() {
  const email = await requireStaff("/admin");
  if (!email) return <NotStaff />;
  const supabase = await createClient();
  const { data: events } = await supabase.from("events").select("*").order("event_date", { ascending: false });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Events</h1>
          <Link href="/admin/new" className={primaryButton}>
            Create new event
          </Link>
        </div>
        <p className="mt-2 text-sm text-slate-600">Signed in as {email}.</p>
        <EventList events={(events as Event[] | null) ?? []} />
      </main>
    </>
  );
}
