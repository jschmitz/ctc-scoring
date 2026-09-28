/** Preset team colors, named the way they'd be called out at the event. */
export const TEAM_COLORS = [
  { name: "Red", hex: "#dc2626" },
  { name: "Blue", hex: "#2563eb" },
  { name: "Green", hex: "#16a34a" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Orange", hex: "#ea580c" },
  { name: "Purple", hex: "#9333ea" },
  { name: "Pink", hex: "#db2777" },
  { name: "Teal", hex: "#0d9488" },
  { name: "Sky blue", hex: "#0ea5e9" },
  { name: "Lime", hex: "#65a30d" },
  { name: "Navy", hex: "#1e3a8a" },
  { name: "Maroon", hex: "#7f1d1d" },
  { name: "Brown", hex: "#92400e" },
  { name: "Gray", hex: "#6b7280" },
  { name: "Black", hex: "#111827" },
  { name: "White", hex: "#ffffff" },
] as const;

export function colorName(hex: string): string | undefined {
  return TEAM_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name;
}

/** Preset colors not yet taken, in palette order; wraps around once all are used. */
export function nextColors(taken: string[], count: number): string[] {
  const used = new Set(taken.map((c) => c.toLowerCase()));
  const free = TEAM_COLORS.map((c) => c.hex).filter((hex) => !used.has(hex));
  const pool = free.length > 0 ? free : TEAM_COLORS.map((c) => c.hex);
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}
