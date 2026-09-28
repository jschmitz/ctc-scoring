#!/bin/sh
# Entrypoint for the app image: apply pending migrations, then start Next.js.
# Runs on every container start; migrate.sh skips migrations already applied.
set -e
MIGRATIONS_DIR=/app/migrations bash /app/migrate.sh
exec node server.js
