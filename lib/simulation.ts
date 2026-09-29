import type { SupabaseClient } from "@supabase/supabase-js";
import { generateRotation, roundCount } from "./rotation";
import { simulateCounts, teamSkill } from "./simulate";
import { nextColors } from "./teamColors";
import type { Challenge, Event, Slot, Team } from "./types";

/**
 * Simulated events (events.is_simulation): a labeled copy of a real event whose
 * scores are generated, so staff can preview how the leaderboard plays out. All
 * writes go through the same tables and save_score RPC as real scoring, so the
 * leaderboard, schedule, score table and CSV behave exactly as on event day.
 * The source event is only read, never written.
 */

const SAMPLE_TEAM_COUNT = 8;

type EventRow = Pick<Event, "id" | "current_round" | "status">;

async function check<T>(op: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await op;
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Copies an event's challenges, scoring, teams and rotation into a new simulation
 * event, left live at round 1 with no scores. Events without teams get sample
 * teams, and events without a rotation get a generated one. Returns the new id.
 */
export async function createSimulation(supabase: SupabaseClient, sourceId: string): Promise<string> {
  const [source, challenges, teams, slots] = await Promise.all([
    check(supabase.from("events").select("*").eq("id", sourceId).single()) as Promise<Event>,
    check(supabase.from("challenges").select("*, scoring_components(*)").eq("event_id", sourceId).order("position")) as Promise<Challenge[]>,
    check(supabase.from("teams").select("*").eq("event_id", sourceId).order("number")) as Promise<Team[]>,
    check(supabase.from("rotation_slots").select("*").eq("event_id", sourceId)) as Promise<Slot[]>,
  ]);
  if (challenges.length === 0) throw new Error("This event has no challenges to simulate.");

  const sim = (await check(
    supabase
      .from("events")
      .insert({
        name: `${source.name} (simulation)`,
        event_date: source.event_date,
        teams_per_station: source.teams_per_station,
        scoring_mode: source.scoring_mode,
        is_simulation: true,
      })
      .select()
      .single(),
  )) as Event;

  try {
    const challengeIds = new Map<string, string>();
    for (const c of challenges) {
      const copy = (await check(
        supabase
          .from("challenges")
          .insert({ event_id: sim.id, position: c.position, name: c.name, description: c.description, time_limit_sec: c.time_limit_sec })
          .select()
          .single(),
      )) as { id: string };
      challengeIds.set(c.id, copy.id);
      await check(
        supabase
          .from("scoring_components")
          .insert(c.scoring_components.map((sc) => ({ challenge_id: copy.id, position: sc.position, label: sc.label, points: sc.points }))),
      );
    }

    const sourceTeams =
      teams.length > 0
        ? teams.map((t) => ({ id: t.id, number: t.number, name: t.name, captain: t.captain, color: t.color }))
        : nextColors([], SAMPLE_TEAM_COUNT).map((color, i) => ({ id: "", number: i + 1, name: `Team ${i + 1}`, captain: "", color }));
    const newTeams = (await check(
      supabase
        .from("teams")
        .insert(sourceTeams.map(({ number, name, captain, color }) => ({ event_id: sim.id, number, name, captain, color })))
        .select(),
    )) as Team[];
    const teamIds = new Map(sourceTeams.map((t) => [t.id || `#${t.number}`, newTeams.find((n) => n.number === t.number)!.id]));

    // Reuse the real rotation when there is one, so the schedule matches; otherwise generate it.
    const rotation =
      teams.length > 0 && slots.length > 0
        ? slots.map((s) => ({ round_number: s.round_number, team_id: teamIds.get(s.team_id)!, challenge_id: challengeIds.get(s.challenge_id)! }))
        : generateRotation(
            newTeams.map((t) => t.id),
            [...challengeIds.values()],
            source.teams_per_station,
          );
    await check(supabase.rpc("replace_rotation", { p_event_id: sim.id, p_slots: rotation }));
    await check(supabase.from("events").update({ status: "live", current_round: 1 }).eq("id", sim.id));
    return sim.id;
  } catch (err) {
    // Don't leave a half-built simulation behind; deleting cascades to everything above.
    await supabase.from("events").delete().eq("id", sim.id).eq("is_simulation", true);
    throw err;
  }
}

async function loadForScoring(supabase: SupabaseClient, eventId: string) {
  const [event, challenges, slots] = await Promise.all([
    check(supabase.from("events").select("id, current_round, status, is_simulation").eq("id", eventId).single()) as Promise<EventRow & { is_simulation: boolean }>,
    check(supabase.from("challenges").select("id, scoring_components(*)").eq("event_id", eventId)) as Promise<Pick<Challenge, "id" | "scoring_components">[]>,
    check(supabase.from("rotation_slots").select("*").eq("event_id", eventId)) as Promise<Slot[]>,
  ]);
  if (!event.is_simulation) throw new Error("Only simulation events can be filled with generated scores.");
  return { event, challenges: new Map(challenges.map((c) => [c.id, c.scoring_components])), slots, rounds: roundCount(slots) };
}

async function scoreSlots(supabase: SupabaseClient, slots: Slot[], components: Map<string, Challenge["scoring_components"]>) {
  await Promise.all(
    slots.map((s) =>
      check(
        supabase.rpc("save_score", {
          p_team_id: s.team_id,
          p_challenge_id: s.challenge_id,
          p_counts: simulateCounts(components.get(s.challenge_id) ?? [], teamSkill(s.team_id)),
          p_notes: "Simulated",
        }),
      ),
    ),
  );
}

/** Scores the current round, then moves to the next one, or marks the event final after the last. */
export async function playNextRound(supabase: SupabaseClient, eventId: string): Promise<void> {
  const { event, challenges, slots, rounds } = await loadForScoring(supabase, eventId);
  if (event.status === "final") return;
  const round = Math.min(event.current_round, rounds);
  await scoreSlots(supabase, slots.filter((s) => s.round_number === round), challenges);
  const done = round >= rounds;
  await check(
    supabase
      .from("events")
      .update(done ? { status: "final", current_round: rounds } : { current_round: round + 1 })
      .eq("id", eventId),
  );
}

/** Scores every remaining round at once and marks the event final. */
export async function finishSimulation(supabase: SupabaseClient, eventId: string): Promise<void> {
  const { event, challenges, slots, rounds } = await loadForScoring(supabase, eventId);
  if (event.status === "final") return;
  await scoreSlots(supabase, slots.filter((s) => s.round_number >= event.current_round), challenges);
  await check(supabase.from("events").update({ status: "final", current_round: rounds }).eq("id", eventId));
}

/** Clears a simulation's scores and puts it back at round 1, ready to play again. */
export async function restartSimulation(supabase: SupabaseClient, eventId: string): Promise<void> {
  await loadForScoring(supabase, eventId);
  await check(supabase.from("scores").delete().eq("event_id", eventId));
  await check(supabase.from("events").update({ status: "live", current_round: 1 }).eq("id", eventId));
}

/** Deletes a simulation and everything in it. Refuses real events. */
export async function deleteSimulation(supabase: SupabaseClient, eventId: string): Promise<void> {
  await check(supabase.from("events").delete().eq("id", eventId).eq("is_simulation", true));
}
