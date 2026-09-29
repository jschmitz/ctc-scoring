"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSimulation, finishSimulation } from "@/lib/simulation";
import { createClient } from "@/lib/supabase/client";

/** Makes a simulation copy of an event, plays every round, and opens its final leaderboard. */
export function SimulateButton({ eventId }: { eventId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function simulate() {
    setBusy(true);
    try {
      const id = await createSimulation(supabase, eventId);
      await finishSimulation(supabase, id);
      router.push(`/event/${id}/leaderboard`);
    } catch (err) {
      window.alert(`Couldn't simulate: ${err instanceof Error ? err.message : err}`);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={simulate}
      disabled={busy}
      title="Copy this event and fill it with random scores to preview the final standings. The real event isn't changed."
      className="rounded-md border border-gold px-3 py-1.5 text-accent-strong hover:bg-gold/10 disabled:opacity-60"
    >
      {busy ? "Simulating…" : "Simulate"}
    </button>
  );
}
