import Link from "next/link";

type Tab = "leaderboard" | "schedule" | "score" | "admin";

const tabs: { key: Tab; label: string; href: (id: string) => string }[] = [
  { key: "leaderboard", label: "Leaderboard", href: (id) => `/event/${id}/leaderboard` },
  { key: "schedule", label: "Schedule", href: (id) => `/event/${id}/schedule` },
  { key: "score", label: "Score table", href: (id) => `/score/${id}` },
  { key: "admin", label: "Setup", href: (id) => `/admin/events/${id}` },
];

// Styled like runvaders.com's nav: dark maroon with a gold bottom rule.
const headerClass = "no-print border-b-[3px] border-gold bg-accent-strong";
const brand = (
  <Link href="/" className="font-bold uppercase tracking-wide text-white hover:text-gold-light">
    CTC Scoring
  </Link>
);

/** Marks a simulated event everywhere it's shown, so it's never mistaken for the real one. */
export function SimulationBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`rounded-full bg-gold px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent-strong ${className}`}>
      Simulation
    </span>
  );
}

/** The brand bar alone, for pages outside an event (home, login). */
export function SiteHeader() {
  return (
    <header className={headerClass}>
      <div className="mx-auto flex max-w-6xl items-center px-4 py-3">{brand}</div>
    </header>
  );
}

export function EventNav({
  eventId,
  eventName,
  active,
  simulation = false,
}: {
  eventId: string;
  eventName?: string;
  active: Tab;
  simulation?: boolean;
}) {
  return (
    <header className={headerClass}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        {brand}
        {eventName && <span className="text-white/70">{eventName}</span>}
        {simulation && <SimulationBadge />}
        <nav className="flex flex-wrap gap-1 sm:ml-auto">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href(eventId)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                t.key === active ? "bg-white/10 font-medium text-gold-light" : "text-white/85 hover:bg-white/10 hover:text-white"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
