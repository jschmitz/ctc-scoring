"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { input, primaryButton } from "@/components/ui";
import { applySheetRotation, populateFromScoringSheet, SHEET_CHALLENGES, SHEET_NAME, SHEET_TEAMS } from "@/lib/scoringSheet";
import { createClient } from "@/lib/supabase/client";
import type { Challenge, Event } from "@/lib/types";

/** Select value for starting from the organizers' scoring sheet rather than another event. */
const FROM_SHEET = "scoring-sheet";

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
      .eq("is_simulation", false)
      .order("event_date", { ascending: false })
      .then(({ data }) => {
        setEvents((data as Event[]) ?? []);
        setCopyFrom(FROM_SHEET);
      });
  }, [supabase]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fromSheet = copyFrom === FROM_SHEET;
      const { data: event, error } = await supabase
        .from("events")
        // The scoring sheet ranks challenges, so an event started from it uses enhanced scoring.
        .insert({ name, event_date: date || null, ...(fromSheet ? { scoring_mode: "enhanced" } : {}) })
        .select()
        .single();
      if (error) throw error;

      if (fromSheet) {
        try {
          const { challengeIds, teamIds } = await populateFromScoringSheet(supabase, event.id);
          await applySheetRotation(supabase, event.id, challengeIds, teamIds);
        } catch (err) {
          // Don't leave a half-filled event behind.
          await supabase.from("events").delete().eq("id", event.id);
          throw err;
        }
      } else if (copyFrom) {
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
          <option value={FROM_SHEET}>
            Start from the {SHEET_NAME} ({SHEET_TEAMS.length} teams, {SHEET_CHALLENGES.length} challenges)
          </option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              Copy from {ev.name}
            </option>
          ))}
          <option value="">Start blank</option>
        </select>
      </label>
      {copyFrom === FROM_SHEET && (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
          Adds the scoring sheet&apos;s {SHEET_TEAMS.length} teams ({SHEET_TEAMS.map((t) => t.name).join(", ")}) and its{" "}
          {SHEET_CHALLENGES.length} challenges ({SHEET_CHALLENGES.map((c) => c.name).join(", ")}) with their scoring notes, and turns
          on enhanced scoring. There are no scores yet, as on the sheet. Also fills in the printed rotation (2 teams per station, 6
          rounds; Trivia isn&apos;t a station, so it&apos;s scored on its own) — double-check it in Setup → Edit rotation against the
          original schedule before the event. Rename teams and add staff in Setup.
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button disabled={busy} className={primaryButton}>
        {busy ? "Creating…" : "Create event"}
      </button>
    </form>
  );
}
