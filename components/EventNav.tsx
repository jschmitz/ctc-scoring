import Link from "next/link";

type Tab = "leaderboard" | "schedule" | "score" | "admin";

const tabs: { key: Tab; label: string; href: (id: string) => string }[] = [
  { key: "leaderboard", label: "Leaderboard", href: (id) => `/event/${id}/leaderboard` },
  { key: "schedule", label: "Schedule", href: (id) => `/event/${id}/schedule` },
  { key: "score", label: "Score table", href: (id) => `/score/${id}` },
  { key: "admin", label: "Setup", href: (id) => `/admin/events/${id}` },
];

export function EventNav({ eventId, eventName, active }: { eventId: string; eventName?: string; active: Tab }) {
  return (
    <header className="no-print border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold text-slate-900">
          CTC Scoring
        </Link>
        {eventName && <span className="text-slate-500">{eventName}</span>}
        <nav className="flex flex-wrap gap-1 sm:ml-auto">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href(eventId)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                t.key === active ? "bg-accent-soft font-medium text-accent-strong" : "text-slate-600 hover:bg-slate-100"
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
