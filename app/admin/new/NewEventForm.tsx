"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { input, primaryButton } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { Challenge, Event } from "@/lib/types";

export function NewEventForm() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("events")
      .select("*")
      .order("event_date", { ascending: false })
      .then(({ data }) => {
        setEvents((data as Event[]) ?? []);
        setCopyFrom(data?.[0]?.id ?? "");
      });
  }, [supabase]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data: event, error } = await supabase
        .from("events")
        .insert({ name, event_date: date || null })
        .select()
        .single();
      if (error) throw error;

      if (copyFrom) {
        const { data: source, error: srcError } = await supabase
          .from("challenges")
          .select("*, scoring_components(*)")
          .eq("event_id", copyFrom);
        if (srcError) throw srcError;
        for (const c of source as Challenge[]) {
          const { data: copy, error: cError } = await supabase
            .from("challenges")
            .insert({ event_id: event.id, position: c.position, name: c.name, description: c.description, time_limit_sec: c.time_limit_sec })
            .select()
            .single();
          if (cError) throw cError;
          const { error: compError } = await supabase.from("scoring_components").insert(
            c.scoring_components.map((sc) => ({ challenge_id: copy.id, position: sc.position, label: sc.label, points: sc.points })),
          );
          if (compError) throw compError;
        }
      }
      router.push(`/admin/events/${event.id}`);
    } catch (err) {
      setError((err as { message?: string }).message ?? "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} className="mt-6 space-y-4">
      <label className="block text-sm font-medium">
        Name
        <input required value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-1 w-full`} placeholder="CTC 2027 Challenge" />
      </label>
      <label className="block text-sm font-medium">
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${input} mt-1 w-full`} />
      </label>
      <label className="block text-sm font-medium">
        Challenges
        <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className={`${input} mt-1 w-full`}>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              Copy from {ev.name}
            </option>
          ))}
          <option value="">Start blank</option>
        </select>
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button disabled={busy} className={primaryButton}>
        {busy ? "Creating…" : "Create event"}
      </button>
    </form>
  );
}
