import { describe, expect, it } from "vitest";
import { fixedRotationSlots, SHEET_CHALLENGES, SHEET_TEAMS } from "../scoringSheet";

// Challenge/team ids don't matter for this check, so use the names themselves as ids.
const challengeIds = new Map(SHEET_CHALLENGES.map((c) => [c.name, c.name]));
const teamIds = new Map(SHEET_TEAMS.map((t) => [t.name, t.name]));
const slots = fixedRotationSlots(challengeIds, teamIds);

// The printed schedule has no Trivia station.
const STATIONS = SHEET_CHALLENGES.map((c) => c.name).filter((n) => n !== "Trivia");

describe("fixedRotationSlots (the printed rotation)", () => {
  it("has 2 teams per station per round across 6 rounds", () => {
    expect(slots).toHaveLength(6 * STATIONS.length * 2);
  });

  it("sends every team to every station exactly once", () => {
    for (const team of SHEET_TEAMS) {
      const visited = slots.filter((s) => s.team_id === team.name).map((s) => s.challenge_id);
      expect(new Set(visited)).toEqual(new Set(STATIONS));
    }
  });

  it("gives every team exactly one station per round", () => {
    for (let round = 1; round <= 6; round++) {
      const here = slots.filter((s) => s.round_number === round);
      expect(new Set(here.map((s) => s.team_id)).size).toBe(SHEET_TEAMS.length);
    }
  });

  it("never seats more than 2 teams at a station in the same round", () => {
    for (let round = 1; round <= 6; round++) {
      for (const station of STATIONS) {
        expect(slots.filter((s) => s.round_number === round && s.challenge_id === station)).toHaveLength(2);
      }
    }
  });
});
