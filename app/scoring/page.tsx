import type { Metadata } from "next";
import { SiteHeader } from "@/components/EventNav";
import { buildEnhancedLeaderboard, ENHANCED_ASSUMPTIONS } from "@/lib/enhancedScoring";
import { ENHANCED_EXAMPLES, type EnhancedExample } from "@/lib/enhancedScoring.examples";

export const metadata: Metadata = {
  title: "Enhanced scoring rules · CTC Scoring",
  description: "How enhanced scoring ranks teams within each challenge, with worked examples and how to verify the results.",
};

/** Runs an example through the same calculation the leaderboard uses and compares it with the hand-worked answer. */
function checkExample(example: EnhancedExample): boolean {
  const teams = example.teams.map((name, i) => ({ id: name, number: i + 1, name, color: "#000000" }));
  const challenges = example.challenges.map((name) => ({ id: name, name }));
  const scores = Object.entries(example.scores).flatMap(([challenge, byTeam]) =>
    Object.entries(byTeam).map(([team, total]) => ({ team_id: team, challenge_id: challenge, total })),
  );
  const result = buildEnhancedLeaderboard(teams, challenges, scores);
  // Compare team by team (not as JSON text, which would also compare the order teams are listed in).
  const pointsMatch = example.challenges.every((c) => {
    const placed = result.placings[c] ?? [];
    const expected = Object.entries(example.expectedPoints[c] ?? {});
    return placed.length === expected.length && expected.every(([team, points]) => placed.find((p) => p.teamId === team)?.points === points);
  });
  const standings = result.rows.map((r) => [r.team.name, r.total, r.tied ? `T${r.rank}` : String(r.rank)].join("|"));
  const standingsMatch = standings.join(",") === example.expectedStandings.map((s) => s.join("|")).join(",");
  return pointsMatch && standingsMatch;
}

function Example({ example }: { example: EnhancedExample }) {
  const matches = checkExample(example);
  const rawTotal = (team: string) => example.challenges.reduce((sum, c) => sum + (example.scores[c]?.[team] ?? 0), 0);
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{example.title}</h3>
        <span className={`text-xs font-medium ${matches ? "text-green-700" : "text-red-700"}`}>
          {matches ? "✓ The app's calculation matches this hand-worked answer" : "✗ The app's calculation does NOT match this answer. Report this."}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600">{example.explanation}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Place</th>
              <th className="py-1.5 pr-3 font-medium">Team</th>
              {example.challenges.map((c) => (
                <th key={c} className="px-3 py-1.5 text-center font-medium">
                  {c}
                  <span className="block text-xs font-normal">raw → points</span>
                </th>
              ))}
              <th className="px-3 py-1.5 text-right font-medium">Points</th>
              <th className="py-1.5 pl-3 text-right font-medium text-slate-400">Raw total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {example.expectedStandings.map(([team, total, place]) => (
              <tr key={team}>
                <td className="py-1.5 pr-3 font-semibold tabular-nums">{place}</td>
                <td className="py-1.5 pr-3">{team}</td>
                {example.challenges.map((c) => (
                  <td key={c} className="px-3 py-1.5 text-center tabular-nums">
                    {example.scores[c]?.[team] === undefined ? (
                      <span className="text-slate-400">not played → 0</span>
                    ) : (
                      <>
                        <span className="text-slate-500">{example.scores[c][team]}</span> → <span className="font-semibold">{example.expectedPoints[c][team]}</span>
                      </>
                    )}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right font-bold tabular-nums">{total}</td>
                <td className="py-1.5 pl-3 text-right tabular-nums text-slate-400">{rawTotal(team)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export default function ScoringRulesPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl space-y-10 px-4 py-12">
        <header>
          <h1 className="text-3xl font-semibold">Enhanced scoring</h1>
          <p className="mt-3 text-slate-700">
            Enhanced scoring is optional, and organizers switch it on per event. It changes how the leaderboard adds up the results
            so that every challenge counts the same and the margin of victory doesn&apos;t matter. The scores entered at each
            station are exactly the same either way; only the totals are worked out differently.
          </p>
        </header>

        <section>
          <h2 className="text-xl font-semibold">The rules</h2>
          <ol className="mt-3 list-decimal space-y-3 pl-5 text-slate-700">
            <li>
              <span className="font-medium text-slate-900">Rank each challenge.</span> Within each challenge, teams are ranked by their
              raw score, highest first.
            </li>
            <li>
              <span className="font-medium text-slate-900">Award rank points.</span> First place gets as many points as there are
              teams: with 12 teams, 12 points for first, 11 for second, down to 1 for last.{" "}
              <span className="font-medium text-slate-900">Ties:</span> tied teams both get the higher number, and the next number is
              skipped. With 12 teams, scores of 20, 18, 18 and 15 earn 12, 11, 11 and 9 points.
              <span className="mt-2 block rounded-md bg-slate-100 px-3 py-2 text-sm">
                A shortcut that gives the same answer every time: <span className="font-semibold">points = number of teams − number of
                teams that scored higher</span>.
              </span>
            </li>
            <li>
              <span className="font-medium text-slate-900">Add them up.</span> A team&apos;s total is the sum of its rank points across
              all challenges. The highest total wins.
            </li>
          </ol>
          <p className="mt-4 text-slate-700">
            Why: under standard scoring, one lopsided win (say 40 to 10) can outweigh doing well everywhere else, and a challenge
            with big numbers counts for more than one with small numbers. Rank points put every challenge on the same 1 to 12 scale.
          </p>
          <p className="mt-3 text-slate-700">
            On the leaderboard, every cell shows the rank points with the raw score beside it in grey, and a note appears below the
            table whenever one of these rules changes the outcome: a tie, a challenge not everyone has played yet, a team placed
            differently than on raw totals, or a shared place.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Worked examples</h2>
          <p className="mt-2 text-sm text-slate-600">
            These answers were worked out by hand from the rules. The same examples run as automated tests every time the app is
            updated, and each one is re-checked against the live calculation when this page loads.
          </p>
          <div className="mt-4 space-y-4">
            {ENHANCED_EXAMPLES.map((e) => (
              <Example key={e.id} example={e} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Still to be confirmed</h2>
          <p className="mt-2 text-sm text-slate-600">
            The rules above don&apos;t settle these cases yet. This is how the app handles them for now; they&apos;ll be updated to
            match the organizers&apos; scoring spreadsheet.
          </p>
          <dl className="mt-3 space-y-3">
            {ENHANCED_ASSUMPTIONS.map((a) => (
              <div key={a.id} className="rounded-lg border border-dashed border-gold bg-gold/5 p-4">
                <dt className="font-medium">{a.question}</dt>
                <dd className="mt-1 text-sm text-slate-700">For now: {a.assumption}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h2 className="text-xl font-semibold">How to check the results yourself</h2>
          <p className="mt-2 text-slate-700">
            The standings come from the fixed arithmetic above; nothing is estimated or decided by AI. You don&apos;t have to take the
            app&apos;s word for it:
          </p>
          <ul className="mt-3 list-disc space-y-3 pl-5 text-slate-700">
            <li>
              <span className="font-medium text-slate-900">Check any challenge by eye.</span> The leaderboard shows each team&apos;s raw
              score next to its rank points. Sort a column in your head and count down from the number of teams.
            </li>
            <li>
              <span className="font-medium text-slate-900">Let a spreadsheet recompute it.</span> On the leaderboard, choose{" "}
              <span className="font-medium">Download verification sheet</span> and open it in Excel, Google Sheets or Numbers. It
              takes only the raw scores from the app and recomputes every team&apos;s points, total and place with its own formulas,
              then compares them with the app. Each team shows <span className="font-medium">OK</span> or{" "}
              <span className="font-medium">MISMATCH</span>, and a result line at the bottom says whether they all agree.
            </li>
            <li>
              <span className="font-medium text-slate-900">Tested against known answers.</span> The worked examples above are automated
              tests: the app can&apos;t be updated if its answer to any of them changes.
            </li>
            <li>
              <span className="font-medium text-slate-900">Rehearse it.</span> Simulate the event with enhanced scoring on, download the
              verification sheet, and confirm it before event day.
            </li>
          </ul>
        </section>
      </main>
    </>
  );
}
