-- Simulated events: a labeled copy of a real event, filled with generated scores
-- so staff can preview the leaderboard and final results (lib/simulation.ts).
-- Kept off the public home page; deleting one cascades to its teams and scores.
alter table public.events
  add column is_simulation boolean not null default false;
