import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildEnhancedLeaderboard } from "../enhancedScoring";
import { SCORING_SHEET_EXAMPLE, SHEET_CHALLENGES } from "../scoringSheet";
import { columnLetter, pointsFormula, scoringSheetXlsx, tabName } from "../scoringSheetWorkbook";

// Copied verbatim from the organizers' workbook (every challenge tab, cell D4).
const SHEET_POINTS_D4 =
  "IF(C4=1,12,(IF(C4=2,11,(IF(C4=3,10,(IF(C4=4,9,(IF(C4=5,8,(IF(C4=6,7,(IF(C4=7,6,0)))))))))))))+IF(C4=8,5,(IF(C4=9,4,(IF(C4=10,3,(IF(C4=11,2,(IF(C4=12,1,0)))))))))";

describe("pointsFormula", () => {
  it("is character for character the scoring sheet's formula for 12 teams", () => {
    expect(pointsFormula("C4", 12)).toBe(SHEET_POINTS_D4);
  });

  it("scales the same structure to other team counts", () => {
    expect(pointsFormula("C9", 3)).toBe("IF(C9=1,3,(IF(C9=2,2,(IF(C9=3,1,0)))))");
    expect(pointsFormula("C4", 8).split("+")).toHaveLength(2);
  });
});

describe("helpers", () => {
  it.each([
    [1, "A"],
    [26, "Z"],
    [27, "AA"],
    [52, "AZ"],
    [53, "BA"],
  ])("columnLetter(%i) = %s", (n, letter) => expect(columnLetter(n)).toBe(letter));

  it("makes tab names Excel accepts", () => {
    expect(tabName(4, "Archery")).toBe("4-Archery");
    expect(tabName(1, "A/B: test? [x]")).toBe("1-A B  test   x ");
    expect(tabName(1, "x".repeat(40))).toHaveLength(31);
  });
});

describe("the exported workbook", async () => {
  const example = SCORING_SHEET_EXAMPLE;
  const teams = example.teams.map((name, i) => ({ id: name, number: i + 1, name, color: "#000000" }));
  const challenges = SHEET_CHALLENGES.map((c, i) => ({ id: c.name, position: i + 1, name: c.name, description: c.description }));
  const scores = Object.entries(example.scores).flatMap(([c, byTeam]) => Object.entries(byTeam).map(([t, total]) => ({ team_id: t, challenge_id: c, total })));
  const board = buildEnhancedLeaderboard(teams, challenges, scores);
  const bytes = await scoringSheetXlsx({ eventName: "Example", teams, challenges, board });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const formula = (sheet: string, cell: string) => (wb.getWorksheet(sheet)!.getCell(cell).value as { formula: string }).formula;
  const value = (sheet: string, cell: string) => wb.getWorksheet(sheet)!.getCell(cell).value;

  it("has the sheet's tabs and nothing else (no roster data)", () => {
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      "1-Trivia",
      "2-Obstacle Course",
      "3-Buddy Rescue",
      "4-Toss and Go",
      "5-Archery",
      "6-Soccer Kick",
      "7-Pumpkin Toss",
      "Challenge Standings",
      "Scoring Outline",
    ]);
  });

  it("fills each challenge tab with the app's raw scores and the sheet's Rank and Points formulas", () => {
    const tab = "5-Archery";
    expect([value(tab, "A3"), value(tab, "B3"), value(tab, "C3"), value(tab, "D3")]).toEqual(["Team", "Score", "Rank", "Points"]);
    expect(example.teams.map((t, i) => [value(tab, `A${4 + i}`), value(tab, `B${4 + i}`)])).toEqual(
      example.teams.map((t) => [t, example.scores.Archery[t]]),
    );
    expect(formula(tab, "C4")).toBe("RANK(B4,$B$4:$B$15,0)");
    expect(formula(tab, "D4")).toBe(SHEET_POINTS_D4);
    expect(formula(tab, "C15")).toBe("RANK(B15,$B$4:$B$15,0)");
  });

  it("totals with the sheet's VLOOKUP, SUM and tie-breaker COUNTIF", () => {
    const st = "Challenge Standings";
    expect(formula(st, "B4")).toBe("VLOOKUP(A4,'1-Trivia'!$A$3:$D$15,4,FALSE)");
    expect(formula(st, "H4")).toBe("VLOOKUP(A4,'7-Pumpkin Toss'!$A$3:$D$15,4,FALSE)");
    expect(formula(st, "I4")).toBe("SUM(B4:H4)");
    expect(formula(st, "J4")).toBe("COUNTIF(B4:H4,12)");
  });

  it("adds a place with the tie-breaker, the app's answer, and a check for every team", () => {
    const st = "Challenge Standings";
    expect([value(st, "K3"), value(st, "L3"), value(st, "M3"), value(st, "N3")]).toEqual(["Place (sheet)", "Total (app)", "Place (app)", "Check"]);
    expect(formula(st, "K4")).toBe('1+COUNTIF(I$4:I$15,">"&I4)+COUNTIFS(I$4:I$15,I4,J$4:J$15,">"&J4)');
    expect(formula(st, "N4")).toBe('IFERROR(IF(AND(I4=L4,K4=M4),"OK","MISMATCH"),"Waiting for all scores")');
    // The app's own totals and places, in team order.
    const appRows = example.teams.map((t, i) => [value(st, `A${4 + i}`), value(st, `L${4 + i}`), value(st, `M${4 + i}`)]);
    expect(appRows).toEqual(example.teams.map((t) => {
      const r = board.rows.find((row) => row.team.name === t)!;
      return [t, r.total, r.rank];
    }));
    expect(formula(st, "B17")).toContain('COUNTIF(N4:N15,"OK")=12');
  });

  it("includes the Place → Points table", () => {
    const so = "Scoring Outline";
    expect(Array.from({ length: 12 }, (_, i) => [value(so, `C${i + 2}`), value(so, `D${i + 2}`)])).toEqual(
      Array.from({ length: 12 }, (_, i) => [i + 1, 12 - i]),
    );
  });
});
