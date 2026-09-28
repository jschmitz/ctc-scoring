import { colorName } from "@/lib/teamColors";

/** A team's color dot followed by its name. */
export function TeamName({ team, className = "" }: { team: { name: string; color: string }; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <ColorDot color={team.color} />
      <span>{team.name}</span>
    </span>
  );
}

export function ColorDot({ color, size = "h-3 w-3" }: { color: string; size?: string }) {
  return (
    <span
      className={`${size} inline-block shrink-0 rounded-full ring-1 ring-black/15`}
      style={{ backgroundColor: color }}
      title={colorName(color) ?? color}
      aria-hidden
    />
  );
}
