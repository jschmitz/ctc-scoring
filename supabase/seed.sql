-- CTC 2026 event with the six challenges from "CTC 2026 Challenge Rules.docx".
-- Local dev also gets a staff login (staff@example.com) and 8 sample teams.

insert into public.staff (email) values ('staff@example.com');

insert into public.events (id, name, event_date)
values ('00000000-0000-0000-0000-000000002026', 'CTC 2026 Challenge', '2026-10-17');

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

insert into public.teams (event_id, number, name, captain, color) values
  ('00000000-0000-0000-0000-000000002026', 1, 'Red Team', '', '#dc2626'),
  ('00000000-0000-0000-0000-000000002026', 2, 'Blue Team', '', '#2563eb'),
  ('00000000-0000-0000-0000-000000002026', 3, 'Green Team', '', '#16a34a'),
  ('00000000-0000-0000-0000-000000002026', 4, 'Yellow Team', '', '#eab308'),
  ('00000000-0000-0000-0000-000000002026', 5, 'Orange Team', '', '#ea580c'),
  ('00000000-0000-0000-0000-000000002026', 6, 'Purple Team', '', '#9333ea'),
  ('00000000-0000-0000-0000-000000002026', 7, 'Pink Team', '', '#db2777'),
  ('00000000-0000-0000-0000-000000002026', 8, 'Teal Team', '', '#0d9488');
