import { describe, expect, it } from "vitest";
import { buildEnhancedLeaderboard } from "../enhancedScoring";
import { columnLetter, enhancedVerificationCsv } from "../enhancedVerification";

describe("columnLetter", () => {
  it.each([
    [0, "A"],
    [1, "B"],
    [25, "Z"],
    [26, "AA"],
    [27, "AB"],
    [51, "AZ"],
    [52, "BA"],
  ])("%i → %s", (i, letter) => expect(columnLetter(i)).toBe(letter));
});

/** Minimal CSV reader for the tests (handles quoted cells with commas and doubled quotes). */
function parse(csv: string): string[][] {
  return csv.split("\n").map((line) => {
    const cells: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted && ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = !quoted;
      } else if (ch === "," && !quoted) {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  });
}

describe("enhancedVerificationCsv", () => {
  const teams = [
    { id: "r", number: 1, name: "Red", color: "#000000" },
    { id: "b", number: 2, name: "=Blue", color: "#000000" },
    { id: "g", number: 3, name: "Green, Jr", color: "#000000" },
  ];
  const challenges = [
    { id: "x", name: "Archery" },
    { id: "y", name: "Soccer Kick" },
  ];
  const board = buildEnhancedLeaderboard(teams, challenges, [
    { team_id: "r", challenge_id: "x", total: 9 },
    { team_id: "b", challenge_id: "x", total: 9 },
    { team_id: "g", challenge_id: "x", total: 4 },
    { team_id: "r", challenge_id: "y", total: 2 },
  ]);
  const rows = parse(enhancedVerificationCsv("Test event", challenges, board));

  it("lays out raw scores, point formulas, totals, places and a check per team", () => {
    expect(rows[0]).toEqual([
      "Team #",
      "Team",
      "Archery (raw score)",
      "Soccer Kick (raw score)",
      "Archery (points)",
      "Soccer Kick (points)",
      "Total points (spreadsheet)",
      "Total points (app)",
      "Place (spreadsheet)",
      "Place (app)",
      "Check",
    ]);
    expect(rows[1]).toEqual([
      "1",
      "Red",
      "9",
      "2",
      '=IF(ISNUMBER(C2),COUNTA($B$2:$B$4)-COUNTIF(C$2:C$4,">"&C2),0)',
      '=IF(ISNUMBER(D2),COUNTA($B$2:$B$4)-COUNTIF(D$2:D$4,">"&D2),0)',
      "=SUM(E2:F2)",
      "6",
      '=1+COUNTIF(G$2:G$4,">"&G2)',
      "1",
      '=IF(AND(G2=H2,I2=J2),"OK","MISMATCH")',
    ]);
  });

  it("leaves unplayed challenges blank so they count as 0", () => {
    expect(rows[3].slice(0, 4)).toEqual(["3", "Green, Jr", "4", ""]);
  });

  it("never lets a team name run as a formula", () => {
    expect(rows[2][1]).toBe("'=Blue");
  });

  it("carries the app's own totals and places for the sheet to check against", () => {
    const app = board.rows.map((r) => [r.team.number, r.total, r.rank]).sort((a, b) => a[0] - b[0]);
    expect(rows.slice(1, 4).map((r) => [Number(r[0]), Number(r[7]), Number(r[9])])).toEqual(app);
  });

  it("ends with an overall result formula that counts OK rows", () => {
    const result = rows.find((r) => r[0] === "Result")!;
    expect(result[1]).toMatch(/^=IF\(COUNTIF\(K2:K4,"OK"\)=COUNTA\(\$B\$2:\$B\$4\),"All 3 teams match/);
  });
});
