-- Each team gets a display color (hex), shown next to its name throughout the app.
alter table public.teams
  add column color text not null default '#64748b'
  check (color ~ '^#[0-9a-fA-F]{6}$');
