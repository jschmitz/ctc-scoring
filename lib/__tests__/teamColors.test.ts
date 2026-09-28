import { expect, it } from "vitest";
import { colorName, nextColors, TEAM_COLORS } from "../teamColors";

it("hands out unused preset colors in palette order", () => {
  expect(nextColors(["#DC2626", "#16a34a"], 3)).toEqual(["#2563eb", "#eab308", "#ea580c"]);
});

it("reuses the palette once every color is taken", () => {
  const all = TEAM_COLORS.map((c) => c.hex);
  expect(nextColors(all, 2)).toEqual([all[0], all[1]]);
});

it("names preset colors regardless of case", () => {
  expect(colorName("#2563EB")).toBe("Blue");
  expect(colorName("#123456")).toBeUndefined();
});
