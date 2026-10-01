# CTC Scoring

Score entry, rotation schedule, and live leaderboard for CTC challenge events.
Teams rotate through the challenges and report each result to a central score table.
The leaderboard ranks teams by the sum of their raw points.

- **Score table** (`/score/[eventId]`, staff): enter each team's result as counts per scoring item. The app computes the total, for example Archery center ×5, black ×2, board ×1. Scores are grouped by round and advance to the next pending team after each save.
- **Leaderboard** (`/event/[id]/leaderboard`, public): updates live and has a projector mode.
- **Schedule** (`/event/[id]/schedule`, public): the rotation by station and by team, printable.
- **Setup** (`/admin/events/[id]`, staff): event details, teams (with a paste-in bulk add), challenges and scoring items, rotation, and the staff list. `/admin` lists every event (where staff land after signing in); `/admin/new` creates one, optionally copying another event's challenges.
- **Simulate** (`/admin`, staff): copies an event into a labeled simulation (same challenges, scoring, teams and rotation; sample teams if it has none) and fills it with random but realistic scores, to preview the final standings. Play it all at once or round by round from the simulation's Setup page and watch the leaderboard update live. The real event is never changed, and simulations are hidden from the public home page.
- **Enhanced scoring** (off by default; a checkbox in Setup, switchable any time) follows the organizers' scoring sheet (CTC Scoring Sheet 2026): teams are ranked within each challenge (`RANK`), first place gets as many points as there are teams down to 1 (ties share the higher number and skip the next), points are summed, and a tie on the total goes to the most first-place finishes. The leaderboard shows rank points beside raw scores and explains every tie, tiebreak, provisional challenge and changed place. `/scoring` explains the rules with worked examples that are also unit tests. **Download scoring sheet (Excel)** exports the organizers' sheet (same tabs and formulas) filled with the app's raw scores, with a Check column per team. `lib/__tests__/scoringSheetOracle.test.ts` compares the app with a literal transcription of the sheet's formulas on 7,000 random events.
- **From the scoring sheet** (`/admin/new`): start a real event with the sheet's 12 teams and 7 challenges (including Trivia) and enhanced scoring on. **Create scoring sheet example** (`/admin`) adds the same setup with sample scores that exercise every rule, as a deletable simulation. The workbook itself contains student names and is gitignored; never commit it (the repo is public).
- **Delete event** (Setup, bottom): permanently deletes an event and everything in it, after typing its name.

## Stack
Next.js 16 (App Router) + Tailwind, Supabase (Postgres, Auth magic links, Realtime).
Reads are public. Writes require a signed-in user whose email is in the `staff` table, enforced by row-level security.
Scores are saved through the `save_score` SQL function, which computes the total from the challenge's point values.

## Rotation
With C challenges, N teams, and up to k teams per station, teams move in ⌈N/k⌉ groups through max(C, ⌈N/k⌉) rounds.
Every team does every challenge once. When there are more groups than stations, the extra groups rest each round.
Example: 8 teams, 6 stations → 8 rounds, with 2 teams resting per round.
The rotation can be regenerated while the event status is **Setup** and is locked once the event is **Live**.

## Local development
Requires Docker and the Supabase CLI.

```bash
npm install
supabase start        # API on :54421, Studio on :54423, Mailpit on :54424
npm run dev           # http://localhost:3001
```

`supabase/seed.sql` loads the CTC 2026 event (the six challenges from the rules doc), 8 sample teams, and the staff login `staff@example.com`.
Sign in at `/login` and open the magic link from Mailpit (http://127.0.0.1:54424).
`supabase db reset` reloads the schema and seed.

```bash
npm test              # unit tests: scoring, rotation, leaderboard, CSV
npm run lint
```

## Deploying
Production runs on the shared DigitalOcean Droplet at https://ctc-scoring.runvaders.com, with a self-hosted Supabase stack next to the app.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together, and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the plan, first-time setup, and the event-day runbook.
