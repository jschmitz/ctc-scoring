import type { EnhancedLeaderboard } from "./enhancedScoring";

/**
 * A spreadsheet (CSV with live formulas) that recomputes enhanced scoring on its own,
 * so organizers can verify the app's standings without trusting the app.
 *
 * Only the raw scores come from the app. The spreadsheet then works out rank points
 * with `number of teams − COUNTIF(scores, ">" & this score)`, sums them, ranks the
 * totals, and compares its answer to the app's in the Check column. COUNTIF (unlike
 * RANK, whose sort-order argument differs between Excel and Numbers) behaves the
 * same in Excel, Google Sheets and Numbers.
 */

/** Spreadsheet column letter for a zero-based index: 0 → A, 26 → AA. */
export function columnLetter(index: number): string {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Text that a spreadsheet must show as text, never run as a formula (e.g. a team named "=HYPERLINK(...)"). */
function text(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function enhancedVerificationCsv(
  eventName: string,
  challenges: { id: string; name: string }[],
  board: EnhancedLeaderboard,
): string {
  const rows = [...board.rows].sort((a, b) => a.team.number - b.team.number);
  const first = 2;
  const last = rows.length + 1;
  const k = challenges.length;
  const rawCol = (j: number) => columnLetter(2 + j);
  const pointsCol = (j: number) => columnLetter(2 + k + j);
  const totalCol = columnLetter(2 + 2 * k);
  const appTotalCol = columnLetter(3 + 2 * k);
  const placeCol = columnLetter(4 + 2 * k);
  const appPlaceCol = columnLetter(5 + 2 * k);
  const checkCol = columnLetter(6 + 2 * k);
  const teams = `$B$${first}:$B$${last}`;

  const header = [
    "Team #",
    "Team",
    ...challenges.map((c) => `${text(c.name)} (raw score)`),
    ...challenges.map((c) => `${text(c.name)} (points)`),
    "Total points (spreadsheet)",
    "Total points (app)",
    "Place (spreadsheet)",
    "Place (app)",
    "Check",
  ];

  const body = rows.map((row, i) => {
    const r = first + i;
    return [
      row.team.number,
      text(row.team.name),
      ...challenges.map((c) => row.rawByChallenge[c.id] ?? ""),
      ...challenges.map((_, j) => {
        const range = `${rawCol(j)}$${first}:${rawCol(j)}$${last}`;
        return `=IF(ISNUMBER(${rawCol(j)}${r}),COUNTA(${teams})-COUNTIF(${range},">"&${rawCol(j)}${r}),0)`;
      }),
      k > 0 ? `=SUM(${pointsCol(0)}${r}:${pointsCol(k - 1)}${r})` : 0,
      row.total,
      `=1+COUNTIF(${totalCol}$${first}:${totalCol}$${last},">"&${totalCol}${r})`,
      row.rank,
      `=IF(AND(${totalCol}${r}=${appTotalCol}${r},${placeCol}${r}=${appPlaceCol}${r}),"OK","MISMATCH")`,
    ];
  });

  const checks = `${checkCol}${first}:${checkCol}${last}`;
  const footer = [
    [],
    [
      "Result",
      `=IF(COUNTIF(${checks},"OK")=COUNTA(${teams}),"All ${rows.length} teams match: the spreadsheet agrees with the app","Some rows say MISMATCH: the spreadsheet disagrees with the app")`,
    ],
    [],
    ["How this works"],
    [text(`Event: ${eventName}. Only the raw scores come from the app; this sheet recomputes everything else with its own formulas.`)],
    ["Points for a challenge = number of teams − number of teams that scored higher. Tied teams get the same points, and the next number is skipped."],
    ["A team with no raw score hasn't played that challenge yet and gets 0 for it."],
    ["Place = 1 + number of teams with a higher total. The Check column compares the sheet's total and place with the app's."],
  ];

  return [header, ...body, ...footer].map((r) => r.map(csvCell).join(",")).join("\n");
}
