-- One-time production data: the first staff member and the CTC 2026 event
-- with the six challenges from "CTC 2026 Challenge Rules.docx".
-- Safe to re-run: every insert skips rows that already exist.
--
-- Run as root on the Droplet after the first deploy (migrations must have applied):
--   cd /opt/ctc-scoring
--   docker compose exec -T db psql -U supabase_admin -d postgres \
--     -v staff_email=you@example.com < deploy/bootstrap.sql
--
-- Keep the challenge list in sync with supabase/seed.sql (local dev), which
-- also adds sample teams and a test staff login; this file adds neither.

\set ON_ERROR_STOP on

insert into public.staff (email) values (lower(:'staff_email'))
on conflict (email) do nothing;

insert into public.events (id, name, event_date)
values ('00000000-0000-0000-0000-000000002026', 'CTC 2026 Challenge', '2026-10-17')
on conflict (id) do nothing;

with ch as (
  insert into public.challenges (event_id, position, name, description) values
    ('00000000-0000-0000-0000-000000002026', 1, 'Obstacle Course',
     'One point for each team member that completes the full obstacle course.'),
    ('00000000-0000-0000-0000-000000002026', 2, 'Buddy Rescue',
     'One point per stretcher lap around the cones.'),
    ('00000000-0000-0000-0000-000000002026', 3, 'Toss and Go',
     'Cornhole after the balance beam: in the hole = 2, on the board = 1.'),
    ('00000000-0000-0000-0000-000000002026', 4, 'Archery',
     'Orange center = 5, black = 2, on the board = 1.'),
    ('00000000-0000-0000-0000-000000002026', 5, 'Soccer Kick',
     'One point per goal.'),
    ('00000000-0000-0000-0000-000000002026', 6, 'Pumpkin Toss',
     'One point per ball in the basket.')
  on conflict (event_id, position) do nothing
  returning id, position
)
insert into public.scoring_components (challenge_id, position, label, points)
select ch.id, v.pos, v.label, v.points
from ch
join (values
  (1, 1, 'Finishers', 1),
  (2, 1, 'Laps', 1),
  (3, 1, 'In the hole', 2),
  (3, 2, 'On the board', 1),
  (4, 1, 'Orange center', 5),
  (4, 2, 'Black', 2),
  (4, 3, 'On the board', 1),
  (5, 1, 'Goals', 1),
  (6, 1, 'Baskets', 1)
) as v(challenge_pos, pos, label, points) on v.challenge_pos = ch.position;

select 'staff' as what, count(*) from public.staff
union all select 'challenges', count(*) from public.challenges
union all select 'scoring components', count(*) from public.scoring_components;
