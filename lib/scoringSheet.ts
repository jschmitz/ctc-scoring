import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnhancedExample } from "./enhancedScoring.examples";
import { generateRotation, roundCount } from "./rotation";
import { check } from "./simulation";

/**
 * The structure of the organizers' "CTC Scoring Sheet 2026" workbook: its 12 color
 * teams (rows 4–15 of every challenge tab, in order) and its 7 challenge tabs, with the
 * scoring note from each tab's cell B2. The workbook's roster tabs hold students'
 * personal data and are deliberately not represented here.
 *
 * Used to start a new event from the sheet (populateFromScoringSheet) and to build the
 * scoring-sheet example with sample scores (createScoringSheetExample).
 */

export const SHEET_NAME = "CTC Scoring Sheet 2026";

/** Team names as on the sheet, with a display color for each. */
export const SHEET_TEAMS = [
  { name: "Navy", color: "#1e3a8a" },
  { name: "Gold", color: "#ca8a04" },
  { name: "Lavender", color: "#a78bfa" },
  { name: "Green", color: "#16a34a" },
  { name: "Light Blue", color: "#7dd3fc" },
  { name: "White", color: "#ffffff" },
  { name: "Orange", color: "#ea580c" },
  { name: "Purple", color: "#9333ea" },
  { name: "Red", color: "#dc2626" },
  { name: "Royal Blue", color: "#2563eb" },
  { name: "Pink", color: "#db2777" },
  { name: "Grey", color: "#6b7280" },
] as const;

/**
 * The sheet's challenge tabs in tab order ("0-Trivia" first). Scoring items follow each
 * tab's note; Toss and Go and Archery use the point values from the CTC 2026 rules.
 */
export const SHEET_CHALLENGES = [
  { tab: "0-Trivia", name: "Trivia", description: "# correct answers", components: [{ label: "Correct answers", points: 1 }] },
  {
    tab: "1-Obstacle Course",
    name: "Obstacle Course",
    description: "One point is scored for each team member that completes the full obstacle course.",
    components: [{ label: "Finishers", points: 1 }],
  },
  {
    tab: "2-Buddy Rescue",
    name: "Buddy Rescue",
    description: "1 lap around the cones = 1 point. Score is based on total number of laps completed in 6 minutes.",
    components: [{ label: "Laps", points: 1 }],
  },
  {
    tab: "3-Toss and Go",
    name: "Toss and Go",
    description: "Total up the number of points on the cornhole board after the 6 minute time limit is reached.",
    components: [
      { label: "In the hole", points: 2 },
      { label: "On the board", points: 1 },
    ],
  },
  {
    tab: "4-Archery",
    name: "Archery",
    description: "Scored based on arrows hitting colored areas of target",
    components: [
      { label: "Orange center", points: 5 },
      { label: "Black", points: 2 },
      { label: "On the board", points: 1 },
    ],
  },
  {
    tab: "5-Soccer Kick",
    name: "Soccer Kick",
    description: "One point is scored for each goal made.",
    components: [{ label: "Goals", points: 1 }],
  },
  {
    tab: "6-Pumpkin Toss",
    name: "Pumpkin Toss",
    description: "One point is scored for each ball that goes into the basket",
    components: [{ label: "Baskets", points: 1 }],
  },
] as const;

type SheetTeam = (typeof SHEET_TEAMS)[number]["name"];
type SheetChallenge = (typeof SHEET_CHALLENGES)[number]["name"];

/**
 * Inserts the sheet's teams and challenges into an existing, empty event. Returns the
 * new ids by name. The rotation is left to Setup, like any new event.
 */
export async function populateFromScoringSheet(supabase: SupabaseClient, eventId: string) {
  const challengeIds = new Map<string, string>();
  const componentIds = new Map<string, string[]>();
  for (const [i, c] of SHEET_CHALLENGES.entries()) {
    const row = (await check(
      supabase.from("challenges").insert({ event_id: eventId, position: i + 1, name: c.name, description: c.description }).select().single(),
    )) as { id: string };
    challengeIds.set(c.name, row.id);
    const comps = (await check(
      supabase
        .from("scoring_components")
        .insert(c.components.map((sc, j) => ({ challenge_id: row.id, position: j + 1, label: sc.label, points: sc.points })))
        .select(),
    )) as { id: string; position: number }[];
    componentIds.set(c.name, comps.sort((a, b) => a.position - b.position).map((x) => x.id));
  }
  const teams = (await check(
    supabase
      .from("teams")
      .insert(SHEET_TEAMS.map((t, i) => ({ event_id: eventId, number: i + 1, name: t.name, color: t.color })))
      .select(),
  )) as { id: string; name: string }[];
  return { challengeIds, componentIds, teamIds: new Map(teams.map((t) => [t.name, t.id])) };
}

// ── The scoring-sheet example ──────────────────────────────────────────────────────

/**
 * Sample scores for the example, as counts per scoring item (in the order above).
 * Chosen so every rule shows up: a tie for first (Obstacle Course), a three-way tie
 * (Trivia), a score of 0 (Pink, Obstacle Course), a total tie settled by first-place
 * finishes (Gold and Purple), a place still shared after it (Orange and Royal Blue), and
 * teams placed differently than on raw totals (Light Blue).
 */
const SAMPLE_COUNTS: Record<SheetChallenge, Record<SheetTeam, number[]>> = {
  Trivia: { Navy: [18], Gold: [15], Lavender: [15], Green: [12], "Light Blue": [20], White: [9], Orange: [14], Purple: [15], Red: [11], "Royal Blue": [16], Pink: [8], Grey: [13] },
  "Obstacle Course": { Navy: [9], Gold: [10], Lavender: [7], Green: [10], "Light Blue": [6], White: [8], Orange: [5], Purple: [9], Red: [4], "Royal Blue": [7], Pink: [0], Grey: [6] },
  "Buddy Rescue": { Navy: [12], Gold: [9], Lavender: [11], Green: [13], "Light Blue": [8], White: [10], Orange: [7], Purple: [12], Red: [6], "Royal Blue": [9], Pink: [5], Grey: [11] },
  "Toss and Go": {
    Navy: [5, 4], Gold: [4, 3], Lavender: [3, 3], Green: [6, 4], "Light Blue": [4, 4], White: [2, 4],
    Orange: [5, 3], Purple: [3, 4], Red: [6, 3], "Royal Blue": [2, 3], Pink: [4, 1], Grey: [1, 4],
  },
  Archery: {
    Navy: [3, 3, 2], Gold: [3, 2, 2], Lavender: [4, 4, 2], Green: [2, 2, 3], "Light Blue": [3, 4, 2], White: [1, 2, 3],
    Orange: [3, 2, 2], Purple: [2, 4, 1], Red: [4, 3, 2], "Royal Blue": [1, 4, 1], Pink: [2, 2, 2], Grey: [1, 1, 2],
  },
  "Soccer Kick": { Navy: [6], Gold: [8], Lavender: [5], Green: [7], "Light Blue": [9], White: [4], Orange: [6], Purple: [8], Red: [3], "Royal Blue": [7], Pink: [5], Grey: [2] },
  "Pumpkin Toss": { Navy: [11], Gold: [9], Lavender: [7], Green: [12], "Light Blue": [8], White: [10], Orange: [6], Purple: [9], Red: [14], "Royal Blue": [5], Pink: [7], Grey: [4] },
};

function rawScores(): Record<string, Record<string, number>> {
  return Object.fromEntries(
    SHEET_CHALLENGES.map((c) => [
      c.name,
      Object.fromEntries(
        SHEET_TEAMS.map((t) => [t.name, SAMPLE_COUNTS[c.name][t.name].reduce((sum, n, i) => sum + n * c.components[i].points, 0)]),
      ),
    ]),
  );
}

/**
 * The example as a worked example. Expected points and standings were computed with a
 * transcription of the workbook's own formulas (RANK, the 12→1 table, SUM,
 * COUNTIF(…,12)), not by the app, and are checked against the app by the unit tests
 * and the rules page.
 */
export const SCORING_SHEET_EXAMPLE: EnhancedExample = {
  id: "scoring-sheet",
  title: "The scoring sheet's 12 teams and 7 challenges",
  explanation:
    "Sample scores entered for the sheet's 12 teams. Trivia: Gold, Lavender and Purple tie at 15 and all get 9 points, so 8 and 7 are skipped and Orange gets 6. Obstacle Course: Gold and Green tie for first and both get 12; Pink's 0 still earns 1 point. Gold and Purple both total 61, and Gold takes 3rd on the tiebreaker (1 first-place finish to none). Orange and Royal Blue total 39 with no first places, so they share 8th. Light Blue has the second-most raw points (88) but finishes 5th.",
  teams: SHEET_TEAMS.map((t) => t.name),
  challenges: SHEET_CHALLENGES.map((c) => c.name),
  scores: rawScores(),
  expectedPoints: {
    Trivia: { Navy: 11, Gold: 9, Lavender: 9, Green: 4, "Light Blue": 12, White: 2, Orange: 6, Purple: 9, Red: 3, "Royal Blue": 10, Pink: 1, Grey: 5 },
    "Obstacle Course": { Navy: 10, Gold: 12, Lavender: 7, Green: 12, "Light Blue": 5, White: 8, Orange: 3, Purple: 10, Red: 2, "Royal Blue": 7, Pink: 1, Grey: 5 },
    "Buddy Rescue": { Navy: 11, Gold: 6, Lavender: 9, Green: 12, "Light Blue": 4, White: 7, Orange: 3, Purple: 11, Red: 2, "Royal Blue": 6, Pink: 1, Grey: 9 },
    "Toss and Go": { Navy: 10, Gold: 7, Lavender: 5, Green: 12, "Light Blue": 8, White: 3, Orange: 9, Purple: 6, Red: 11, "Royal Blue": 2, Pink: 5, Grey: 1 },
    Archery: { Navy: 9, Gold: 8, Lavender: 12, Green: 5, "Light Blue": 10, White: 2, Orange: 8, Purple: 6, Red: 11, "Royal Blue": 3, Pink: 4, Grey: 1 },
    "Soccer Kick": { Navy: 7, Gold: 11, Lavender: 5, Green: 9, "Light Blue": 12, White: 3, Orange: 7, Purple: 11, Red: 2, "Royal Blue": 9, Pink: 5, Grey: 1 },
    "Pumpkin Toss": { Navy: 10, Gold: 8, Lavender: 5, Green: 11, "Light Blue": 6, White: 9, Orange: 3, Purple: 8, Red: 12, "Royal Blue": 2, Pink: 5, Grey: 1 },
  },
  expectedStandings: [
    ["Navy", 68, "1"],
    ["Green", 65, "2"],
    ["Gold", 61, "3"],
    ["Purple", 61, "4"],
    ["Light Blue", 57, "5"],
    ["Lavender", 52, "6"],
    ["Red", 43, "7"],
    ["Orange", 39, "T8"],
    ["Royal Blue", 39, "T8"],
    ["White", 34, "10"],
    ["Grey", 23, "11"],
    ["Pink", 22, "12"],
  ],
};

/**
 * Creates the scoring-sheet example as a simulation event (badged, off the public list,
 * deletable from Setup): the sheet's teams and challenges, a rotation, the sample scores
 * entered through save_score, enhanced scoring on, and the event marked final.
 */
export async function createScoringSheetExample(supabase: SupabaseClient): Promise<string> {
  const event = (await check(
    supabase
      .from("events")
      .insert({ name: `${SHEET_NAME} – example`, is_simulation: true, scoring_mode: "enhanced" })
      .select()
      .single(),
  )) as { id: string };
  try {
    const { challengeIds, componentIds, teamIds } = await populateFromScoringSheet(supabase, event.id);
    const rotation = generateRotation([...teamIds.values()], [...challengeIds.values()], 1);
    await check(supabase.rpc("replace_rotation", { p_event_id: event.id, p_slots: rotation }));
    await check(supabase.from("events").update({ status: "live" }).eq("id", event.id));
    await Promise.all(
      SHEET_CHALLENGES.flatMap((c) =>
        SHEET_TEAMS.map((t) =>
          check(
            supabase.rpc("save_score", {
              p_team_id: teamIds.get(t.name),
              p_challenge_id: challengeIds.get(c.name),
              p_counts: Object.fromEntries(componentIds.get(c.name)!.map((id, i) => [id, SAMPLE_COUNTS[c.name][t.name][i]])),
              p_notes: "Scoring sheet example",
            }),
          ),
        ),
      ),
    );
    await check(supabase.from("events").update({ status: "final", current_round: roundCount(rotation) }).eq("id", event.id));
    return event.id;
  } catch (err) {
    await supabase.from("events").delete().eq("id", event.id).eq("is_simulation", true);
    throw err;
  }
}
