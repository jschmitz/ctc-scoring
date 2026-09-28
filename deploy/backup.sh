#!/usr/bin/env bash
# Nightly pg_dump, run by root's cron on the Droplet (deploy/crontab.example),
# not by the ctc-scoring user, whose sudo doesn't include `compose exec`.
# Adapted from food-shopper.
#
# Keeps 14 dailies and 3 monthlies in $BACKUP_ROOT. A backup that never leaves
# the Droplet isn't a backup: set RCLONE_REMOTE in .env (an `rclone config`
# remote, e.g. a DigitalOcean Spaces bucket) to sync off-host after each dump.
#
# Run it by hand before and after the event: sudo /opt/ctc-scoring/deploy/backup.sh
set -euo pipefail
cd /opt/ctc-scoring

RCLONE_REMOTE="$(grep -E '^RCLONE_REMOTE=' .env | cut -d= -f2- | sed 's/[[:space:]]*#.*//' || true)"
POSTGRES_DB="$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2- | sed 's/[[:space:]]*#.*//')"
POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2- | sed 's/[[:space:]]*#.*//')"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/ctc-scoring/backups}"
DAILY_DIR="$BACKUP_ROOT/daily"
MONTHLY_DIR="$BACKUP_ROOT/monthly"
KEEP_DAILY=14
KEEP_MONTHLY=3

mkdir -p "$DAILY_DIR" "$MONTHLY_DIR"
chmod 700 "$BACKUP_ROOT"

STAMP="$(date +%Y-%m-%d-%H%M)"
DAILY_FILE="$DAILY_DIR/ctc-scoring-$STAMP.sql.gz"

# No local `db` service: this app shares food-shopper's supabase-db container,
# dumping only this app's own database (ctc_scoring), not food-shopper's.
docker exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" supabase-db pg_dump -U supabase_admin -d "$POSTGRES_DB" | gzip >"$DAILY_FILE"
echo "backup: wrote $DAILY_FILE"

if [ "$(date +%d)" = "01" ]; then
  cp "$DAILY_FILE" "$MONTHLY_DIR/ctc-scoring-$(date +%Y-%m).sql.gz"
fi

find "$DAILY_DIR" -name '*.sql.gz' -type f -printf '%T@ %p\n' | sort -rn |
  tail -n +$((KEEP_DAILY + 1)) | cut -d' ' -f2- | xargs -r rm -f
find "$MONTHLY_DIR" -name '*.sql.gz' -type f -printf '%T@ %p\n' | sort -rn |
  tail -n +$((KEEP_MONTHLY + 1)) | cut -d' ' -f2- | xargs -r rm -f

if [ -n "$RCLONE_REMOTE" ]; then
  rclone sync "$BACKUP_ROOT" "$RCLONE_REMOTE" --log-level ERROR
  echo "backup: synced to $RCLONE_REMOTE"
else
  echo "backup: WARNING: RCLONE_REMOTE not set, dump only exists on this Droplet"
fi
