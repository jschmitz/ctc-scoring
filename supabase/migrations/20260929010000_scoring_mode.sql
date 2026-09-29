-- Scoring mode per event. 'standard' ranks teams by summed raw points (the
-- original behavior); 'enhanced' ranks teams within each challenge and sums
-- rank points instead (lib/enhancedScoring.ts, explained at /scoring).
-- Only the leaderboard's arithmetic changes; stored scores are the same in
-- both modes, so switching back and forth is always safe.
alter table public.events
  add column scoring_mode text not null default 'standard'
  check (scoring_mode in ('standard', 'enhanced'));
