import type { Workbook, Worksheet } from "exceljs";
import type { EnhancedLeaderboard } from "./enhancedScoring";

/**
 * Exports an event as a copy of the organizers' "CTC Scoring Sheet 2026" workbook: the
 * same tabs, layout and formulas, filled with the app's raw scores. Opening it in Excel,
 * the organizers' own formulas compute every rank, point, total and tie-breaker, and
 * the added Check column compares the sheet's answer with the app's for each team.
 *
 * Formulas are the workbook's own (for 12 teams the Points formula is character for
 * character the sheet's); for other team counts the same formulas are generated for
 * that many rows. Only the raw scores and the "(app)" columns come from the app.
 * The workbook is generated from scratch: nothing is copied from the original file,
 * whose roster tabs hold students' personal data.
 */

export type WorkbookInput = {
  eventName: string;
  teams: { id: string; number: number; name: string }[];
  challenges: { id: string; position: number; name: string; description: string }[];
  board: EnhancedLeaderboard;
};

/** The sheet's Points formula: nested IFs mapping rank → points, in groups of 7 like the sheet (12 → 1 for 12 teams). */
export function pointsFormula(rankCell: string, teamCount: number): string {
  const nest = (ranks: number[]): string => {
    const [r, ...rest] = ranks;
    const points = teamCount + 1 - r;
    return rest.length === 0 ? `IF(${rankCell}=${r},${points},0)` : `IF(${rankCell}=${r},${points},(${nest(rest)}))`;
  };
  const ranks = Array.from({ length: teamCount }, (_, i) => i + 1);
  const groups: number[][] = [];
  for (let i = 0; i < ranks.length; i += 7) groups.push(ranks.slice(i, i + 7));
  return groups.map(nest).join("+");
}

/** Spreadsheet column letter for a 1-based index: 1 → A, 27 → AA. */
export function columnLetter(n: number): string {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** A tab name Excel accepts: no []:*?/\ and at most 31 characters. */
export function tabName(position: number, name: string): string {
  return `${position}-${name}`.replace(/[[\]:*?/\\]/g, " ").slice(0, 31);
}

/** Excel shows text that starts with = as a formula; keep team names as plain text. */
function text(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

const FIRST_ROW = 4;

function header(sheet: Worksheet, row: number, values: string[]) {
  const r = sheet.getRow(row);
  r.values = values;
  r.font = { bold: true };
}

export async function buildScoringSheetWorkbook({ eventName, teams, challenges, board }: WorkbookInput): Promise<Workbook> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "CTC Scoring";
  wb.calcProperties.fullCalcOnLoad = true;

  const n = teams.length;
  const last = FIRST_ROW + n - 1;
  const ordered = [...teams].sort((a, b) => a.number - b.number);
  const rowOf = new Map(board.rows.map((r) => [r.team.id, r]));
  const tabs = [...challenges].sort((a, b) => a.position - b.position).map((c) => ({ ...c, tab: tabName(c.position, c.name) }));

  // One tab per challenge: Team | Score | Rank | Points, as on the organizers' sheet.
  for (const c of tabs) {
    const sheet = wb.addWorksheet(c.tab);
    sheet.getCell("A1").value = c.name;
    sheet.getCell("A1").font = { bold: true, size: 14 };
    sheet.getCell("B2").value = c.description;
    header(sheet, 3, ["Team", "Score", "Rank", "Points"]);
    ordered.forEach((team, i) => {
      const r = FIRST_ROW + i;
      sheet.getCell(`A${r}`).value = text(team.name);
      const raw = rowOf.get(team.id)?.rawByChallenge[c.id];
      if (raw !== undefined) sheet.getCell(`B${r}`).value = raw;
      sheet.getCell(`C${r}`).value = { formula: `RANK(B${r},$B$${FIRST_ROW}:$B$${last},0)` };
      sheet.getCell(`D${r}`).value = { formula: pointsFormula(`C${r}`, n) };
    });
    sheet.columns = [{ width: 16 }, { width: 10 }, { width: 8 }, { width: 8 }];
  }

  // Challenge Standings: the sheet's VLOOKUP / SUM / COUNTIF, plus verification columns.
  const st = wb.addWorksheet("Challenge Standings");
  st.getCell("A1").value = "Challenge Standings";
  st.getCell("A1").font = { bold: true, size: 14 };
  st.getCell("A2").value = eventName;
  const k = tabs.length;
  const col = (i: number) => columnLetter(i);
  const totalCol = col(k + 2);
  const winsCol = col(k + 3);
  const placeCol = col(k + 4);
  const appTotalCol = col(k + 5);
  const appPlaceCol = col(k + 6);
  const checkCol = col(k + 7);
  header(st, 3, [
    "Team",
    ...tabs.map((c) => c.tab),
    "Total",
    "Tie Breaker Num of Wins",
    "Place (sheet)",
    "Total (app)",
    "Place (app)",
    "Check",
  ]);
  ordered.forEach((team, i) => {
    const r = FIRST_ROW + i;
    const row = rowOf.get(team.id);
    st.getCell(`A${r}`).value = text(team.name);
    tabs.forEach((c, j) => {
      st.getCell(`${col(j + 2)}${r}`).value = { formula: `VLOOKUP(A${r},'${c.tab}'!$A$3:$D$${last},4,FALSE)` };
    });
    st.getCell(`${totalCol}${r}`).value = { formula: `SUM(B${r}:${col(k + 1)}${r})` };
    st.getCell(`${winsCol}${r}`).value = { formula: `COUNTIF(B${r}:${col(k + 1)}${r},${n})` };
    // Most points; on a tie, most first-place finishes (Scoring Outline).
    st.getCell(`${placeCol}${r}`).value = {
      formula:
        `1+COUNTIF(${totalCol}$${FIRST_ROW}:${totalCol}$${last},">"&${totalCol}${r})` +
        `+COUNTIFS(${totalCol}$${FIRST_ROW}:${totalCol}$${last},${totalCol}${r},${winsCol}$${FIRST_ROW}:${winsCol}$${last},">"&${winsCol}${r})`,
    };
    st.getCell(`${appTotalCol}${r}`).value = row?.total ?? 0;
    st.getCell(`${appPlaceCol}${r}`).value = row?.rank ?? 0;
    st.getCell(`${checkCol}${r}`).value = {
      formula: `IFERROR(IF(AND(${totalCol}${r}=${appTotalCol}${r},${placeCol}${r}=${appPlaceCol}${r}),"OK","MISMATCH"),"Waiting for all scores")`,
    };
  });
  const resultRow = last + 2;
  st.getCell(`A${resultRow}`).value = "Result";
  st.getCell(`A${resultRow}`).font = { bold: true };
  st.getCell(`B${resultRow}`).value = {
    formula: `IF(COUNTIF(${checkCol}${FIRST_ROW}:${checkCol}${last},"OK")=${n},"All ${n} teams match: the sheet's formulas agree with the app",IF(COUNTIF(${checkCol}${FIRST_ROW}:${checkCol}${last},"MISMATCH")>0,"MISMATCH: the sheet disagrees with the app for at least one team","Waiting for all scores: the sheet needs every score to compute totals"))`,
  };
  st.getCell(`B${resultRow}`).font = { bold: true };
  const notes = [
    "Columns up to Tie Breaker Num of Wins use the scoring sheet's own formulas. Only the scores on each challenge tab come from the app.",
    "Place (sheet) applies the tie-breaker: the most points wins, and a tie goes to the most first-place finishes (Scoring Outline).",
    "Total (app) and Place (app) are what the app shows on the leaderboard; Check compares them with the sheet's answer.",
  ];
  notes.forEach((note, i) => (st.getCell(`A${resultRow + 2 + i}`).value = note));
  st.columns = [{ width: 16 }, ...tabs.map(() => ({ width: 12 })), { width: 8 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 22 }];
  st.views = [{ state: "frozen", xSplit: 1, ySplit: 3 }];

  // Scoring Outline: the organizers' rules and the Place → Points table.
  const so = wb.addWorksheet("Scoring Outline");
  so.getCell("A1").value =
    "1st place in each event gets as many points as there are teams (12 with 12 teams), 2nd place one fewer, and so on. In the event of a tie, all tied teams receive the points for that place, and the next team drops down to the place it actually earned.";
  so.getCell("A5").value = "All challenges will be scored on points. Highest points per challenge earns first place.";
  so.getCell("A9").value =
    "The team with the highest score after all challenges are completed wins. In the event of a tie, the team that has earned the most first place finishes wins.";
  so.getCell("C1").value = "Place";
  so.getCell("D1").value = "Points";
  so.getCell("C1").font = so.getCell("D1").font = { bold: true };
  for (let place = 1; place <= n; place++) {
    so.getCell(`C${place + 1}`).value = place;
    so.getCell(`D${place + 1}`).value = n + 1 - place;
  }
  so.getColumn(1).width = 90;
  so.getColumn(1).alignment = { wrapText: true, vertical: "top" };

  // Standings first, like the sheet's summary, then the challenge tabs, then the rules.
  wb.views = [{ activeTab: tabs.length, x: 0, y: 0, width: 20000, height: 10000, firstSheet: 0, visibility: "visible" }];
  return wb;
}

/** The workbook as .xlsx bytes. */
export async function scoringSheetXlsx(input: WorkbookInput): Promise<ArrayBuffer> {
  const wb = await buildScoringSheetWorkbook(input);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
