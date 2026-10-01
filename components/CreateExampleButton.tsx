"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { secondaryButton } from "@/components/ui";
import { createScoringSheetExample } from "@/lib/scoringSheet";
import { createClient } from "@/lib/supabase/client";

/**
 * Creates the scoring-sheet example (the organizers' 12 teams and 7 challenges with
 * sample scores, enhanced scoring on) and opens its leaderboard.
 */
export function CreateExampleButton() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const id = await createScoringSheetExample(supabase);
      router.push(`/event/${id}/leaderboard`);
    } catch (err) {
      window.alert(`Couldn't create the example: ${err instanceof Error ? err.message : err}`);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={create}
      disabled={busy}
      title="The scoring sheet's 12 teams and 7 challenges with sample scores and enhanced scoring, to compare against the spreadsheet. Shown as a simulation and deletable."
      className={secondaryButton}
    >
      {busy ? "Creating…" : "Create scoring sheet example"}
    </button>
  );
}
