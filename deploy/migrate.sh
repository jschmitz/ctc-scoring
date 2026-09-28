#!/usr/bin/env bash
# Runs as part of the `app` container's entrypoint (see deploy/docker-entrypoint.sh)
# and as the standalone `migrate` compose service. Applies supabase/migrations/*.sql
# against the self-hosted db in filename order, tracking what's already run
# in supabase_migrations.schema_migrations so re-running is a no-op.
#
# There's no Supabase CLI on the Droplet, so this is a deliberately small
# stand-in for `supabase db push` — plain psql, no CLI dependency. Migrations
# are append-only, so "already applied, skip" is always correct.
#
# Copied from food-shopper.
set -euo pipefail

: "${POSTGRES_HOST:?}" "${POSTGRES_PORT:?}" "${POSTGRES_DB:?}" "${POSTGRES_PASSWORD:?}"
export PGPASSWORD="$POSTGRES_PASSWORD"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"

psql_admin() {
  psql -v ON_ERROR_STOP=1 -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U supabase_admin -d "$POSTGRES_DB" "$@"
}

psql_admin -c "create schema if not exists supabase_migrations;"
psql_admin -c "create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  name text not null,
  applied_at timestamptz not null default now()
);"

shopt -s nullglob
for file in "$MIGRATIONS_DIR"/*.sql; do
  base="$(basename "$file")"
  version="${base%%_*}"

  already="$(psql_admin -tAc "select 1 from supabase_migrations.schema_migrations where version = '${version}'")"
  if [ "$already" = "1" ]; then
    echo "skip   $base (already applied)"
    continue
  fi

  echo "apply  $base"
  psql_admin -1 -f "$file"
  psql_admin -c "insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${base}');"
done

echo "migrations up to date"
