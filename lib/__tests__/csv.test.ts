import { expect, it } from "vitest";
import { scoresToCsv } from "../csv";

it("writes one row per score, sorted by team then challenge, with quoting", () => {
  const challenges = [
    { id: "c2", event_id: "e", position: 2, name: "Archery", description: "", time_limit_sec: 360, scoring_components: [
      { id: "k1", label: "Center", points: 5, position: 1 },
      { id: "k2", label: "Board", points: 1, position: 2 },
    ] },
    { id: "c1", event_id: "e", position: 1, name: "Obstacle Course", description: "", time_limit_sec: 360, scoring_components: [
      { id: "k0", label: "Finishers", points: 1, position: 1 },
    ] },
  ];
  const teams = [
    { id: "t2", event_id: "e", number: 2, name: "Blue, Jays", captain: "", color: "#dc2626" },
    { id: "t1", event_id: "e", number: 1, name: "Red", captain: "", color: "#dc2626" },
  ];
  const base = { notes: "", entered_by: "a@b.c", entered_at: "", updated_at: "2026-10-17T10:00:00Z" };
  const scores = [
    { ...base, id: "s1", team_id: "t2", challenge_id: "c1", total: 4, score_components: [{ component_id: "k0", count: 4 }] },
    { ...base, id: "s2", team_id: "t1", challenge_id: "c2", total: 11, notes: 'said "great"', score_components: [
      { component_id: "k1", count: 2 },
      { component_id: "k2", count: 1 },
    ] },
  ];

  expect(scoresToCsv({ challenges, teams, scores }).split("\n")).toEqual([
    "Team #,Team,Challenge,Breakdown,Total,Notes,Entered by,Updated at",
    '1,Red,Archery,Center: 2; Board: 1,11,"said ""great""",a@b.c,2026-10-17T10:00:00Z',
    '2,"Blue, Jays",Obstacle Course,Finishers: 4,4,,a@b.c,2026-10-17T10:00:00Z',
  ]);
});
