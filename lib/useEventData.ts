"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "./supabase/client";
import type { Challenge, Event, Score, Slot, Team } from "./types";

export type EventData = {
  event: Event;
  challenges: Challenge[];
  teams: Team[];
  slots: Slot[];
  scores: Score[];
};

/**
 * Loads everything for one event and keeps it fresh: scores and the event row
 * (current round, status) update live through Supabase Realtime.
 */
export function useEventData(eventId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<EventData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [event, challenges, teams, slots, scores] = await Promise.all([
      supabase.from("events").select("*").eq("id", eventId).single(),
      supabase
        .from("challenges")
        .select("*, scoring_components(*)")
        .eq("event_id", eventId)
        .order("position")
        .order("position", { referencedTable: "scoring_components" }),
      supabase.from("teams").select("*").eq("event_id", eventId).order("number"),
      supabase.from("rotation_slots").select("*").eq("event_id", eventId).order("round_number"),
      supabase.from("scores").select("*, score_components(component_id, count)").eq("event_id", eventId),
    ]);
    const failed = [event, challenges, teams, slots, scores].find((r) => r.error);
    if (failed?.error) {
      setError(failed.error.message);
      return;
    }
    setError(null);
    setData({
      event: event.data as Event,
      challenges: challenges.data as Challenge[],
      teams: teams.data as Team[],
      slots: slots.data as Slot[],
      scores: scores.data as Score[],
    });
  }, [supabase, eventId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    reload();
    const channel = supabase
      .channel(`event-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "scores", filter: `event_id=eq.${eventId}` }, () => reload())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "events", filter: `id=eq.${eventId}` }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, eventId, reload]);

  return { data, error, reload, supabase };
}
