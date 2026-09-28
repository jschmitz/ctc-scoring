"use client";

import { useEffect, useRef, useState } from "react";
import { colorName, TEAM_COLORS } from "@/lib/teamColors";
import { ColorDot } from "./TeamName";

/** Swatch button that opens the preset palette, with a custom color as a fallback. */
export function TeamColorPicker({
  value,
  takenBy,
  onChange,
}: {
  value: string;
  /** Other teams' names by lowercase hex, to flag colors already in use. */
  takenBy: Record<string, string>;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function pick(hex: string) {
    setOpen(false);
    if (hex.toLowerCase() !== value.toLowerCase()) onChange(hex);
  }

  const clash = takenBy[value.toLowerCase()];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm hover:bg-slate-50"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <ColorDot color={value} size="h-4 w-4" />
        <span className="truncate">{colorName(value) ?? value}</span>
        {clash && (
          <span className="ml-auto text-xs text-amber-700" title={`Also used by ${clash}`}>
            same as {clash}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Team color" className="absolute left-0 z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <div className="grid grid-cols-4 gap-2">
            {TEAM_COLORS.map((c) => {
              const selected = c.hex.toLowerCase() === value.toLowerCase();
              const usedBy = takenBy[c.hex.toLowerCase()];
              return (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => pick(c.hex)}
                  title={usedBy ? `${c.name} (used by ${usedBy})` : c.name}
                  className={`flex flex-col items-center gap-1 rounded-md p-1 text-[11px] hover:bg-slate-50 ${selected ? "bg-slate-100 font-medium" : ""}`}
                >
                  <span
                    className={`relative h-7 w-7 rounded-full ring-1 ring-black/15 ${selected ? "outline-2 outline-offset-2 outline-slate-900" : ""}`}
                    style={{ backgroundColor: c.hex }}
                  >
                    {usedBy && !selected && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-400" />}
                  </span>
                  {c.name}
                </button>
              );
            })}
          </div>
          <label className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-sm text-slate-600">
            Custom color
            <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-10 cursor-pointer rounded border border-slate-300" />
          </label>
          <p className="mt-1 text-[11px] text-slate-400">A gray corner dot means another team has that color.</p>
        </div>
      )}
    </div>
  );
}
