/**
 * Worked examples of enhanced scoring. The expected points and standings below are
 * worked out by hand from the rules, NOT computed by the app. The rules page (/scoring)
 * shows them, and lib/__tests__/enhancedScoring.test.ts fails if the app's calculation
 * ever disagrees with any of them. Add scenarios from the organizers' spreadsheet here
 * the same way, and they become both documentation and tests.
 */

import { SCORING_SHEET_EXAMPLE } from "./scoringSheet";

export type EnhancedExample = {
  id: string;
  title: string;
  explanation: string;
  teams: string[];
  challenges: string[];
  /** Raw scores: scores[challenge][team]. A missing team hasn't played that challenge. */
  scores: Record<string, Record<string, number>>;
  /** Hand-worked rank points: expectedPoints[challenge][team]. */
  expectedPoints: Record<string, Record<string, number>>;
  /**
   * Hand-worked final order: [team, enhanced total, place] with "T" marking a shared
   * place. Tied teams are listed in team order (the order of `teams`), as on the leaderboard.
   */
  expectedStandings: [string, number, string][];
};

export const ENHANCED_EXAMPLES: EnhancedExample[] = [
  SCORING_SHEET_EXAMPLE,
  {
    id: "basic",
    title: "Ranking one challenge",
    explanation:
      "With 5 teams, the best score gets 5 points and the lowest gets 1. Blue and Green tied at 18, so both get the higher number (4). The next number (3) is skipped, so Yellow, the next team, gets 2.",
    teams: ["Red", "Blue", "Green", "Yellow", "Purple"],
    challenges: ["Archery"],
    scores: { Archery: { Red: 20, Blue: 18, Green: 18, Yellow: 15, Purple: 9 } },
    expectedPoints: { Archery: { Red: 5, Blue: 4, Green: 4, Yellow: 2, Purple: 1 } },
    expectedStandings: [
      ["Red", 5, "1"],
      ["Blue", 4, "T2"],
      ["Green", 4, "T2"],
      ["Yellow", 2, "4"],
      ["Purple", 1, "5"],
    ],
  },
  {
    id: "tie-for-first",
    title: "A tie for first place",
    explanation:
      "Red and Blue both scored 7. Both get the top points (4 with 4 teams), 3 is skipped, and Green gets 2.",
    teams: ["Red", "Blue", "Green", "Yellow"],
    challenges: ["Soccer Kick"],
    scores: { "Soccer Kick": { Red: 7, Blue: 7, Green: 5, Yellow: 2 } },
    expectedPoints: { "Soccer Kick": { Red: 4, Blue: 4, Green: 2, Yellow: 1 } },
    expectedStandings: [
      ["Red", 4, "T1"],
      ["Blue", 4, "T1"],
      ["Green", 2, "3"],
      ["Yellow", 1, "4"],
    ],
  },
  {
    id: "margin",
    title: "Margin of victory doesn't count",
    explanation:
      "Red wins the Obstacle Course by a huge margin (40 to 10) and has by far the most raw points (51), but that win is worth 3 rank points, the same as any other win. Blue places 2nd, 2nd and 1st for 7 points and wins. On raw totals Red would win easily.",
    teams: ["Red", "Blue", "Green"],
    challenges: ["Obstacle Course", "Soccer Kick", "Pumpkin Toss"],
    scores: {
      "Obstacle Course": { Red: 40, Blue: 10, Green: 9 },
      "Soccer Kick": { Red: 5, Blue: 9, Green: 10 },
      "Pumpkin Toss": { Red: 6, Blue: 12, Green: 11 },
    },
    expectedPoints: {
      "Obstacle Course": { Red: 3, Blue: 2, Green: 1 },
      "Soccer Kick": { Red: 1, Blue: 2, Green: 3 },
      "Pumpkin Toss": { Red: 1, Blue: 3, Green: 2 },
    },
    expectedStandings: [
      ["Blue", 7, "1"],
      ["Green", 6, "2"],
      ["Red", 5, "3"],
    ],
  },
  {
    id: "tiebreak",
    title: "Tiebreak: most first-place finishes",
    explanation:
      "Red and Blue both finish with 7 points. Red won two challenges (Obstacle Course and Soccer Kick) and Blue won one (Pumpkin Toss), so Red takes 1st on the tiebreaker. On raw totals Blue (22) would beat Red (19).",
    teams: ["Red", "Blue", "Green"],
    challenges: ["Obstacle Course", "Soccer Kick", "Pumpkin Toss"],
    scores: {
      "Obstacle Course": { Red: 10, Blue: 8, Green: 5 },
      "Soccer Kick": { Red: 6, Blue: 5, Green: 2 },
      "Pumpkin Toss": { Red: 3, Blue: 9, Green: 7 },
    },
    expectedPoints: {
      "Obstacle Course": { Red: 3, Blue: 2, Green: 1 },
      "Soccer Kick": { Red: 3, Blue: 2, Green: 1 },
      "Pumpkin Toss": { Red: 1, Blue: 3, Green: 2 },
    },
    expectedStandings: [
      ["Red", 7, "1"],
      ["Blue", 7, "2"],
      ["Green", 4, "3"],
    ],
  },
  {
    id: "final-tie",
    title: "Still tied after the tiebreaker",
    explanation:
      "Red and Green both finish with 7 points and each won one challenge (Red: Archery, Green: Buddy Rescue), so the tiebreaker can't separate them and they share 1st place. On raw totals Green (19) would be ahead of Red (17).",
    teams: ["Red", "Blue", "Green", "Yellow"],
    challenges: ["Archery", "Buddy Rescue"],
    scores: {
      Archery: { Red: 12, Green: 10, Blue: 8, Yellow: 3 },
      "Buddy Rescue": { Red: 5, Blue: 4, Green: 9, Yellow: 2 },
    },
    expectedPoints: {
      Archery: { Red: 4, Green: 3, Blue: 2, Yellow: 1 },
      "Buddy Rescue": { Red: 3, Blue: 2, Green: 4, Yellow: 1 },
    },
    expectedStandings: [
      ["Red", 7, "T1"],
      ["Green", 7, "T1"],
      ["Blue", 4, "3"],
      ["Yellow", 2, "4"],
    ],
  },
  {
    id: "in-progress",
    title: "Before every team has played",
    explanation:
      "Yellow hasn't played Toss and Go yet, so it has 0 for now. The three teams that have played are ranked, still counting down from 4 because there are 4 teams. These points are provisional and will change once Yellow plays.",
    teams: ["Red", "Blue", "Green", "Yellow"],
    challenges: ["Toss and Go"],
    scores: { "Toss and Go": { Red: 11, Blue: 8, Green: 8 } },
    expectedPoints: { "Toss and Go": { Red: 4, Blue: 3, Green: 3 } },
    expectedStandings: [
      ["Red", 4, "1"],
      ["Blue", 3, "T2"],
      ["Green", 3, "T2"],
      ["Yellow", 0, "4"],
    ],
  },
];
