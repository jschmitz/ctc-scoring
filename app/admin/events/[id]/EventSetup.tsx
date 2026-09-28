"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EventNav } from "@/components/EventNav";
import { card, input, primaryButton, secondaryButton } from "@/components/ui";
import { TeamColorPicker } from "@/components/TeamColorPicker";
import { generateRotation, roundCount } from "@/lib/rotation";
import { nextColors, TEAM_COLORS } from "@/lib/teamColors";
import type { EventStatus } from "@/lib/types";
import { useEventData, type EventData } from "@/lib/useEventData";

type SectionProps = { data: EventData; supabase: SupabaseClient; reload: () => Promise<void> };

/** Runs a Supabase mutation and surfaces its error with an alert, then reloads. */
async function run(reload: () => Promise<void>, op: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await op;
  if (error) window.alert(error.message);
  await reload();
}

export function EventSetup({ eventId }: { eventId: string }) {
  const { data, error, reload, supabase } = useEventData(eventId);
  if (error) return <p className="p-8 text-red-700">Couldn&apos;t load the event: {error}</p>;
  if (!data) return <p className="p-8 text-slate-500">Loading…</p>;
  const props = { data, supabase, reload };

  return (
    <>
      <EventNav eventId={eventId} eventName={data.event.name} active="admin" />
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
        <EventSettings {...props} />
        <RotationPanel {...props} />
        <TeamsEditor {...props} />
        <ChallengesEditor {...props} />
        <StaffEditor {...props} />
      </main>
    </>
  );
}

function EventSettings({ data, supabase, reload }: SectionProps) {
  const [form, setForm] = useState({
    name: data.event.name,
    event_date: data.event.event_date ?? "",
    status: data.event.status,
    teams_per_station: data.event.teams_per_station,
  });
  const dirty =
    form.name !== data.event.name ||
    form.event_date !== (data.event.event_date ?? "") ||
    form.status !== data.event.status ||
    form.teams_per_station !== data.event.teams_per_station;

  function save(e: React.FormEvent) {
    e.preventDefault();
    run(reload, supabase.from("events").update({ ...form, event_date: form.event_date || null }).eq("id", data.event.id));
  }

  return (
    <form onSubmit={save} className={card}>
      <h2 className="text-lg font-semibold">Event</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium">
          Name
          <input required className={`${input} mt-1 w-full`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="text-sm font-medium">
          Date
          <input type="date" className={`${input} mt-1 w-full`} value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
        </label>
        <label className="text-sm font-medium">
          Status
          <select className={`${input} mt-1 w-full`} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EventStatus })}>
            <option value="setup">Setup (rotation editable)</option>
            <option value="live">Live (rotation locked)</option>
            <option value="final">Final</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Teams per station
          <input
            type="number"
            min={1}
            className={`${input} mt-1 w-full`}
            value={form.teams_per_station}
            onChange={(e) => setForm({ ...form, teams_per_station: Math.max(1, e.target.valueAsNumber || 1) })}
          />
        </label>
      </div>
      <button disabled={!dirty} className={`${primaryButton} mt-4`}>
        Save event
      </button>
    </form>
  );
}

function RotationPanel({ data, supabase, reload }: SectionProps) {
  const { event, teams, challenges, slots } = data;
  const locked = event.status !== "setup";
  const preview = generateRotation(
    teams.map((t) => t.id),
    challenges.map((c) => c.id),
    event.teams_per_station,
  );
  const stale = slots.length > 0 && slots.length !== teams.length * challenges.length;

  function save() {
    if (slots.length > 0 && !window.confirm("Replace the existing rotation?")) return;
    run(reload, supabase.rpc("replace_rotation", { p_event_id: event.id, p_slots: preview }));
  }

  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">Rotation</h2>
      <p className="mt-1 text-sm text-slate-600">
        {teams.length} teams × {challenges.length} challenges, up to {event.teams_per_station} team
        {event.teams_per_station > 1 ? "s" : ""} per station at once → <b>{roundCount(preview)} rounds</b>.
        {slots.length > 0 ? ` A ${roundCount(slots)}-round rotation is saved.` : " No rotation saved yet."}
      </p>
      {stale && (
        <p className="mt-2 rounded-md bg-amber-50 p-2.5 text-sm text-amber-900">
          Teams or challenges changed since the rotation was generated. Regenerate it.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={locked || preview.length === 0} className={primaryButton}>
          {slots.length > 0 ? "Regenerate rotation" : "Generate rotation"}
        </button>
        <a href={`/event/${event.id}/schedule`} className={secondaryButton}>
          View schedule
        </a>
        {locked && <span className="text-sm text-slate-500">Locked: set the status back to Setup to change it.</span>}
      </div>
    </section>
  );
}

function TeamsEditor({ data, supabase, reload }: SectionProps) {
  const [bulk, setBulk] = useState("");
  const nextNumber = data.teams.reduce((max, t) => Math.max(max, t.number), 0) + 1;

  function addTeams(e: React.FormEvent) {
    e.preventDefault();
    const parsed = bulk
      .split("\n")
      .map((line) => line.split(/[,\t]/).map((s) => s.trim()))
      .filter(([name]) => name)
      .map(([name, ...rest]) => {
        // Any extra field that's a color name or hex is the color; the other is the captain.
        const color = rest.map(parseColor).find(Boolean);
        const captain = rest.find((f) => f && !parseColor(f)) ?? "";
        return { name, captain, color };
      });
    if (parsed.length === 0) return;
    const auto = nextColors(
      [...data.teams.map((t) => t.color), ...parsed.flatMap((p) => (p.color ? [p.color] : []))],
      parsed.length,
    );
    let a = 0;
    const rows = parsed.map((p, i) => ({
      event_id: data.event.id,
      number: nextNumber + i,
      name: p.name,
      captain: p.captain,
      color: p.color ?? auto[a++],
    }));
    setBulk("");
    run(reload, supabase.from("teams").insert(rows));
  }

  function update(id: string, patch: { name?: string; captain?: string; number?: number; color?: string }) {
    run(reload, supabase.from("teams").update(patch).eq("id", id));
  }

  function remove(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? Their scores and schedule slots are deleted too.`)) return;
    run(reload, supabase.from("teams").delete().eq("id", id));
  }

  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">Teams ({data.teams.length})</h2>
      {/* No overflow clipping here: the color picker popover extends below the table. */}
      <div className="mt-4">
        {/* Below sm each team is a two-row grid (number, name, delete / color, captain); five
            table columns don't fit a phone. */}
        <table className="w-full text-sm max-sm:block">
          <thead className="text-left text-slate-500 max-sm:hidden">
            <tr>
              <th className="w-20 pb-2 font-medium">#</th>
              <th className="pb-2 font-medium">Name</th>
              <th className="w-48 pb-2 font-medium">Color</th>
              <th className="pb-2 font-medium">Captain</th>
              <th />
            </tr>
          </thead>
          <tbody className="max-sm:block">
            {data.teams.map((t) => (
              <tr
                key={t.id}
                className="max-sm:grid max-sm:grid-cols-[6.5rem_1fr_auto] max-sm:items-center max-sm:gap-x-2 max-sm:gap-y-1.5 max-sm:border-b max-sm:border-slate-100 max-sm:py-2"
              >
                <td className="py-1 pr-2 max-sm:p-0">
                  <input
                    type="number"
                    className={`${input} w-16`}
                    defaultValue={t.number}
                    onBlur={(e) => e.target.valueAsNumber !== t.number && update(t.id, { number: e.target.valueAsNumber })}
                  />
                </td>
                <td className="py-1 pr-2 max-sm:p-0">
                  <input className={`${input} w-full`} placeholder="Team name" defaultValue={t.name} onBlur={(e) => e.target.value !== t.name && update(t.id, { name: e.target.value })} />
                </td>
                <td className="py-1 pr-2 max-sm:col-start-1 max-sm:row-start-2 max-sm:p-0">
                  <TeamColorPicker
                    value={t.color}
                    takenBy={Object.fromEntries(data.teams.filter((o) => o.id !== t.id).map((o) => [o.color.toLowerCase(), o.name]))}
                    onChange={(color) => update(t.id, { color })}
                  />
                </td>
                <td className="py-1 pr-2 max-sm:col-span-2 max-sm:col-start-2 max-sm:row-start-2 max-sm:p-0">
                  <input className={`${input} w-full`} placeholder="Captain (optional)" defaultValue={t.captain} onBlur={(e) => e.target.value !== t.captain && update(t.id, { captain: e.target.value })} />
                </td>
                <td className="py-1 text-right max-sm:col-start-3 max-sm:row-start-1 max-sm:p-0">
                  <button onClick={() => remove(t.id, t.name)} className="text-sm text-red-700 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={addTeams} className="mt-4">
        <label className="text-sm font-medium">
          Add teams: one per line, as <code>Team name, Color, Captain</code>. Color and captain are optional; teams without a color get the next unused one.
          You can paste from a spreadsheet.
          <textarea rows={3} value={bulk} onChange={(e) => setBulk(e.target.value)} className={`${input} mt-1 block w-full font-mono`} placeholder={"Red Rockets, Red, Sam\nBlue Jays, Blue, Alex\nThunder Cats"} />
        </label>
        <button disabled={!bulk.trim()} className={`${primaryButton} mt-2`}>
          Add teams
        </button>
      </form>
    </section>
  );
}

function ChallengesEditor({ data, supabase, reload }: SectionProps) {
  const locked = data.event.status !== "setup";
  const nextPosition = data.challenges.reduce((max, c) => Math.max(max, c.position), 0) + 1;

  async function addChallenge() {
    const { data: created, error } = await supabase
      .from("challenges")
      .insert({ event_id: data.event.id, position: nextPosition, name: `Challenge ${nextPosition}` })
      .select()
      .single();
    if (error) return window.alert(error.message);
    run(reload, supabase.from("scoring_components").insert({ challenge_id: created.id, position: 1, label: "Points", points: 1 }));
  }

  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">Challenges and scoring</h2>
      {locked ? (
        <p className="mt-1 text-sm text-slate-500">Locked while the event is live, so saved totals stay consistent with the point values.</p>
      ) : (
        <p className="mt-1 text-sm text-slate-500">Each challenge has one or more things to count. The score table enters counts and the app multiplies by the points.</p>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {data.challenges.map((c) => (
          <fieldset key={c.id} disabled={locked} className="min-w-0 rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-slate-400">{c.position}.</span>
              <input
                className={`${input} min-w-0 flex-1 font-medium`}
                defaultValue={c.name}
                onBlur={(e) => e.target.value !== c.name && run(reload, supabase.from("challenges").update({ name: e.target.value }).eq("id", c.id))}
              />
              {!locked && (
                <button
                  type="button"
                  onClick={() => window.confirm(`Delete ${c.name} and its scores?`) && run(reload, supabase.from("challenges").delete().eq("id", c.id))}
                  className="text-sm text-red-700 hover:underline"
                >
                  Delete
                </button>
              )}
            </div>
            <textarea
              rows={2}
              className={`${input} mt-2 w-full`}
              defaultValue={c.description}
              placeholder="Scoring note shown at the score table"
              onBlur={(e) => e.target.value !== c.description && run(reload, supabase.from("challenges").update({ description: e.target.value }).eq("id", c.id))}
            />
            <div className="mt-2 space-y-1.5">
              {c.scoring_components.map((sc) => (
                <div key={sc.id} className="flex items-center gap-2 text-sm">
                  <input
                    className={`${input} min-w-0 flex-1`}
                    defaultValue={sc.label}
                    onBlur={(e) => e.target.value !== sc.label && run(reload, supabase.from("scoring_components").update({ label: e.target.value }).eq("id", sc.id))}
                  />
                  <span className="text-slate-500">×</span>
                  <input
                    type="number"
                    min={0}
                    className={`${input} w-16`}
                    defaultValue={sc.points}
                    onBlur={(e) =>
                      e.target.valueAsNumber !== sc.points &&
                      run(reload, supabase.from("scoring_components").update({ points: e.target.valueAsNumber }).eq("id", sc.id))
                    }
                  />
                  <span className="text-slate-500">pts</span>
                  {!locked && c.scoring_components.length > 1 && (
                    <button type="button" onClick={() => run(reload, supabase.from("scoring_components").delete().eq("id", sc.id))} className="text-slate-400 hover:text-red-700" aria-label={`Remove ${sc.label}`}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!locked && (
              <button
                type="button"
                onClick={() =>
                  run(
                    reload,
                    supabase.from("scoring_components").insert({
                      challenge_id: c.id,
                      position: c.scoring_components.reduce((m, sc) => Math.max(m, sc.position), 0) + 1,
                      label: "New item",
                      points: 1,
                    }),
                  )
                }
                className="mt-2 text-sm text-accent-strong hover:underline"
              >
                + Add scoring item
              </button>
            )}
          </fieldset>
        ))}
      </div>
      {!locked && (
        <button onClick={addChallenge} className={`${secondaryButton} mt-4`}>
          + Add challenge
        </button>
      )}
    </section>
  );
}

function StaffEditor({ supabase }: SectionProps) {
  const [staff, setStaff] = useState<string[]>([]);
  const [email, setEmail] = useState("");

  const load = async () => {
    const { data } = await supabase.from("staff").select("email").order("email");
    setStaff((data ?? []).map((r) => r.email));
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("staff").insert({ email: email.trim().toLowerCase() });
    if (error) return window.alert(error.message);
    setEmail("");
    load();
  }

  async function remove(address: string) {
    if (!window.confirm(`Remove ${address} from staff?`)) return;
    await supabase.from("staff").delete().eq("email", address);
    load();
  }

  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">Staff</h2>
      <p className="mt-1 text-sm text-slate-500">These emails can sign in to enter scores and change setup. This list is shared by all events.</p>
      <ul className="mt-3 divide-y divide-slate-100 text-sm">
        {staff.map((s) => (
          <li key={s} className="flex items-center justify-between py-1.5">
            {s}
            <button onClick={() => remove(s)} className="text-red-700 hover:underline">
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="volunteer@example.com" className={`${input} flex-1`} />
        <button className={primaryButton}>Add</button>
      </form>
    </section>
  );
}

/** A preset color name ("Sky blue") or a #rrggbb hex, as a hex; undefined otherwise. */
function parseColor(field: string): string | undefined {
  if (/^#[0-9a-f]{6}$/i.test(field)) return field.toLowerCase();
  return TEAM_COLORS.find((c) => c.name.toLowerCase() === field.toLowerCase())?.hex;
}
