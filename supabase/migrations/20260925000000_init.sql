-- CTC scoring schema.
-- Public (anon) can read everything needed for the leaderboard and schedule.
-- Writes are limited to signed-in users whose email is listed in `staff`.

create table public.staff (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date,
  status text not null default 'setup' check (status in ('setup', 'live', 'final')),
  teams_per_station int not null default 1 check (teams_per_station >= 1),
  current_round int not null default 1 check (current_round >= 1),
  created_at timestamptz not null default now()
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  position int not null,
  name text not null,
  description text not null default '',
  time_limit_sec int not null default 360,
  unique (event_id, position)
);

create table public.scoring_components (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  position int not null,
  label text not null,
  points int not null check (points >= 0),
  unique (challenge_id, position)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  number int not null,
  name text not null,
  captain text not null default '',
  unique (event_id, number)
);

create table public.rotation_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  round_number int not null check (round_number >= 1),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  unique (event_id, team_id, challenge_id),
  unique (event_id, team_id, round_number)
);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  total int not null default 0,
  notes text not null default '',
  entered_by text,
  entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, challenge_id)
);

create table public.score_components (
  score_id uuid not null references public.scores (id) on delete cascade,
  component_id uuid not null references public.scoring_components (id) on delete cascade,
  count int not null check (count >= 0),
  primary key (score_id, component_id)
);

create index on public.challenges (event_id);
create index on public.teams (event_id);
create index on public.rotation_slots (event_id, round_number);
create index on public.scores (event_id);

-- Row level security ---------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['events', 'challenges', 'scoring_components', 'teams',
                           'rotation_slots', 'scores', 'score_components']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
    execute format(
      'create policy "staff write" on public.%I for all to authenticated
         using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

alter table public.staff enable row level security;
create policy "staff manage staff" on public.staff for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Score entry ----------------------------------------------------------------
-- Upserts a score from per-component counts. The total is computed here so the
-- stored total always matches the challenge's point values.
-- p_counts: {"<component_id>": <count>, ...}

create or replace function public.save_score(
  p_team_id uuid,
  p_challenge_id uuid,
  p_counts jsonb,
  p_notes text default ''
)
returns public.scores
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_score public.scores;
  v_total int;
begin
  if not public.is_staff() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select c.event_id into v_event_id
  from public.challenges c
  join public.teams t on t.event_id = c.event_id and t.id = p_team_id
  where c.id = p_challenge_id;

  if v_event_id is null then
    raise exception 'team and challenge must belong to the same event';
  end if;

  if exists (
    select 1 from jsonb_each_text(p_counts) e
    where e.value::int < 0
       or not exists (select 1 from public.scoring_components sc
                      where sc.id = e.key::uuid and sc.challenge_id = p_challenge_id)
  ) then
    raise exception 'invalid component counts';
  end if;

  select coalesce(sum(sc.points * coalesce((p_counts ->> sc.id::text)::int, 0)), 0)
  into v_total
  from public.scoring_components sc
  where sc.challenge_id = p_challenge_id;

  insert into public.scores as s (event_id, team_id, challenge_id, total, notes, entered_by)
  values (v_event_id, p_team_id, p_challenge_id, v_total, coalesce(p_notes, ''),
          auth.jwt() ->> 'email')
  on conflict (team_id, challenge_id) do update
    set total = excluded.total,
        notes = excluded.notes,
        entered_by = excluded.entered_by,
        updated_at = now()
  returning * into v_score;

  delete from public.score_components where score_id = v_score.id;
  insert into public.score_components (score_id, component_id, count)
  select v_score.id, sc.id, coalesce((p_counts ->> sc.id::text)::int, 0)
  from public.scoring_components sc
  where sc.challenge_id = p_challenge_id;

  return v_score;
end;
$$;

-- Replaces an event's rotation. Refused once the event is live.
-- p_slots: [{"round_number": 1, "team_id": "...", "challenge_id": "..."}, ...]

create or replace function public.replace_rotation(p_event_id uuid, p_slots jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if (select status from public.events where id = p_event_id) <> 'setup' then
    raise exception 'rotation is locked once the event is live';
  end if;

  delete from public.rotation_slots where event_id = p_event_id;
  insert into public.rotation_slots (event_id, round_number, team_id, challenge_id)
  select p_event_id, (s ->> 'round_number')::int, (s ->> 'team_id')::uuid,
         (s ->> 'challenge_id')::uuid
  from jsonb_array_elements(p_slots) s;
end;
$$;

-- Realtime for the live leaderboard and score table.
alter publication supabase_realtime add table public.scores, public.events;
