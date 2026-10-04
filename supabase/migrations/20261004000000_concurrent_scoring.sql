-- Per-field score writes, safe for simultaneous staff.
--
-- save_score (added in the init migration) replaces a whole score's components in one
-- call: fine for the score-entry form, which submits everything the staffer typed as
-- one action, but unsafe for the inline score views (By round, Table entry), which save
-- a single cell on blur. Two staff editing different components of the *same*
-- team+challenge around the same time (e.g. Archery's three categories) could each
-- submit a full p_counts built from a client snapshot that doesn't yet have the other's
-- save, and the later call would silently revert it.
--
-- save_score_component and set_score_notes instead touch only the one field named in
-- the call, with the total always recomputed from the database's current component
-- counts rather than a value the client computed. Two staff never conflict unless
-- they're editing the exact same field, in which case the usual last-write-wins
-- applies to that field alone — every other field is untouched either way.
--
-- save_score remains as it was, for single-writer bulk population (the scoring-sheet
-- example, simulations) where there's no concurrent editor to protect against.

create or replace function public.save_score_component(
  p_team_id uuid,
  p_challenge_id uuid,
  p_component_id uuid,
  p_count int
)
returns public.scores
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_score_id uuid;
  v_total int;
begin
  if not public.is_staff() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_count < 0 then
    raise exception 'count must be >= 0';
  end if;
  if not exists (select 1 from public.scoring_components where id = p_component_id and challenge_id = p_challenge_id) then
    raise exception 'component does not belong to challenge';
  end if;

  select c.event_id into v_event_id
  from public.challenges c
  join public.teams t on t.event_id = c.event_id and t.id = p_team_id
  where c.id = p_challenge_id;

  if v_event_id is null then
    raise exception 'team and challenge must belong to the same event';
  end if;

  insert into public.scores as s (event_id, team_id, challenge_id, total, entered_by)
  values (v_event_id, p_team_id, p_challenge_id, 0, auth.jwt() ->> 'email')
  on conflict (team_id, challenge_id) do update
    set entered_by = excluded.entered_by,
        updated_at = now()
  returning s.id into v_score_id;

  insert into public.score_components (score_id, component_id, count)
  values (v_score_id, p_component_id, p_count)
  on conflict (score_id, component_id) do update
    set count = excluded.count;

  select coalesce(sum(sc.points * coalesce(sco.count, 0)), 0)
  into v_total
  from public.scoring_components sc
  left join public.score_components sco on sco.score_id = v_score_id and sco.component_id = sc.id
  where sc.challenge_id = p_challenge_id;

  update public.scores set total = v_total, updated_at = now() where id = v_score_id;

  return (select s from public.scores s where s.id = v_score_id);
end;
$$;

create or replace function public.set_score_notes(
  p_team_id uuid,
  p_challenge_id uuid,
  p_notes text
)
returns public.scores
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_score public.scores;
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

  insert into public.scores as s (event_id, team_id, challenge_id, total, notes, entered_by)
  values (v_event_id, p_team_id, p_challenge_id, 0, coalesce(p_notes, ''), auth.jwt() ->> 'email')
  on conflict (team_id, challenge_id) do update
    set notes = excluded.notes,
        entered_by = excluded.entered_by,
        updated_at = now()
  returning * into v_score;

  return v_score;
end;
$$;
