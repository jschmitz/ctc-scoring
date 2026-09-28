# Deployment Plan

GitHub Actions tests and builds, Docker Hub stores the image, and the shared DigitalOcean
Droplet runs it next to the other apps.
Live at **https://ctc.runvaders.com**.

```
push to main
   ↓
GitHub Actions: typecheck, lint, unit tests, next build
   ↓ (only if green)
build linux/amd64 image → Docker Hub  (jschmitz/ctc-scoring, tags :<sha> + :latest)
   ↓
SSH to Droplet as `ctc-scoring` (scoped sudo) → /opt/ctc-scoring/deploy.sh <sha>
   ↓
app container's entrypoint applies migrations, then starts Next.js
   ↓
host nginx: TLS for ctc.runvaders.com
   /                         → app   127.0.0.1:8084
   /auth /rest /realtime     → kong  127.0.0.1:8085  (self-hosted Supabase)
```

The architecture (components, request flows, trust boundaries, failure modes) is in [ARCHITECTURE.md](ARCHITECTURE.md).

Status: **plan only**. None of the files below exist yet. See [Work to do in this repo](#work-to-do-in-this-repo).

---

## What comes from where

This follows the house pattern the other apps on the Droplet already use. It doesn't invent a new one.

| Borrowed from | What |
|---|---|
| **food-shopper** | The whole shape: Next.js standalone image, a self-hosted Supabase stack in the app's own compose file, a scoped deploy user and `deploy.sh <sha>`, migrate-on-boot entrypoint, `gen-keys.sh`, nightly `backup.sh` as root, and a `verify` job that gates the `ship` job. Most `deploy/` files are copied from there and trimmed. |
| **middle-school-track** | `runvaders.com` is its domain, so `ctc.runvaders.com` sits under it. Also its certbot flow: HTTP-only vhost, then the ACME webroot challenge, then the full HTTPS vhost. Its workflow runs that as root on every deploy. Here it's done **once by hand** instead, because this app's deploy user is scoped the way food-shopper's is. |
| **jakeschmitz-v4** | The simple, readable doc format. Every push to `main` goes straight to production, and there's no staging environment. That's fine for a once-a-year event app, as long as `main` stays deployable. |

What's deliberately different from food-shopper: no `storage`, `imgproxy`, or `meta` containers (this app has no uploads and no dashboard), no `-tools` image or export job (the score table already exports CSV), and no e2e job yet.

---

## The Droplet

The Droplet is shared (`134.122.13.202`, per food-shopper's docs). Each app gets `/opt/<app>`, its own compose file,
its own deploy user, and loopback-only host ports that the Droplet-wide host nginx proxies to.

| Port (127.0.0.1) | App |
|---|---|
| 8080 | family-scheduler |
| 8081 | middle-school-track (runvaders.com) |
| 8082 / 8083 | food-shopper app / kong |
| **8084 / 8085** | **ctc-scoring app / kong** |

Nothing else in this stack publishes a port. `db`, `auth`, `rest`, and `realtime` are reachable only on
the compose network.

**Memory: check this first.** food-shopper's docs call 8 GB the floor for one Supabase stack plus
another app. This adds a second, smaller stack: five containers, about 1–1.5 GB. Before first boot, run
`free -h` and `docker stats --no-stream`. If headroom is under ~2 GB, resize the Droplet (a DigitalOcean
resize keeps the IP and disk) rather than squeezing both stacks.

### Container names must not collide

food-shopper hard-codes `container_name` (`supabase-db`, `supabase-auth`,
`realtime-dev.supabase-realtime`, …), and container names are global on a Docker host. This
compose file therefore sets **no** `container_name` at all. Compose's project-prefixed names
(`ctc-scoring-db-1`, …) keep the two stacks apart.

The one catch is Realtime. It reads its tenant id from the first label of the hostname it's reached at,
which is why food-shopper names it `realtime-dev.…`. Here, instead of a container name, give it a network alias:

```yaml
realtime:
  networks:
    default:
      aliases: [realtime-dev.ctc-realtime]
```

Point `kong.yml`'s realtime routes at `realtime-dev.ctc-realtime:4000`. If you skip this, the leaderboard
loads but never updates live, and no error shows anywhere obvious.

---

## The compose stack

`docker-compose.yml` is food-shopper's with these services kept and nothing else:

| Service | Image (pin the same versions food-shopper runs) | Why |
|---|---|---|
| `app` | `jschmitz/ctc-scoring:${IMAGE_TAG}` | Next.js. Publishes `127.0.0.1:${HOST_APP_PORT:-8084}:3000` |
| `db` | `supabase/postgres` | Data. Volume `db_data` |
| `auth` | `supabase/gotrue` | Magic-link sign-in |
| `rest` | `postgrest/postgrest` | Every read and write, plus the `save_score` / `replace_rotation` RPCs |
| `realtime` | `supabase/realtime` | Live leaderboard, score table, and round changes |
| `kong` | `kong:2.8.1` | Gateway for auth, rest, and realtime. Publishes `127.0.0.1:${HOST_KONG_PORT:-8085}:8000` |

Also copied from food-shopper: `deploy/volumes/db/{roles,jwt,realtime}.sql` as they are, and
`deploy/volumes/api/kong.yml` with the `storage-v1` routes deleted and realtime retargeted (see above).
Plus a `migrate` service under `profiles: ["tools"]` for manual runs.

---

## The image

`Dockerfile`: food-shopper's three stages, switched from pnpm to npm (`npm ci`):

- `deps`: `npm ci`
- `build`: build args `NEXT_PUBLIC_SUPABASE_URL=https://ctc.runvaders.com` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY>`, then `npm run build`. `NEXT_PUBLIC_` values are
  baked into the browser bundle, so they must be present at build time.
- `run`: `node:22-alpine` plus `bash` and `postgresql17-client`, copying the standalone output,
  `.next/static`, `public/`, `deploy/migrate.sh`, `deploy/docker-entrypoint.sh`, and
  `supabase/migrations/`. `ENTRYPOINT ["./docker-entrypoint.sh"]`.

Notes:
- **The self-hosted key is the anon JWT.** The code reads `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
  supabase-js accepts the anon JWT that `gen-keys.sh` prints in that slot. Keep the variable name and
  put the `ANON_KEY` value in it.
- **Build for `linux/amd64`.** An image built on an Apple Silicon Mac without it pulls fine, then fails
  with "exec format error".
- **No secrets in the image.** Runtime config comes from `/opt/ctc-scoring/.env` (mode 600).

---

## The workflow

`.github/workflows/deploy.yml` has two jobs, like food-shopper's.

**`verify`** (every push and PR): `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
e2e isn't included yet. The flows were verified by hand in the browser, and a Playwright suite against a
CI `supabase start` (food-shopper's approach) is the next step if this grows.

**`ship`** (only on `main`, only after `verify` passes): `docker/build-push-action@v6` with
`platforms: linux/amd64`, tags `:sha` + `:latest`, and the two build args. Then `appleboy/ssh-action@v1`
as user `ctc-scoring` runs `/opt/ctc-scoring/deploy.sh ${{ github.sha }}`.

### GitHub secrets

| Secret | Value |
|---|---|
| `DOCKERHUB_USERNAME` | `jschmitz` (same as the other repos) |
| `DOCKERHUB_TOKEN` | Docker Hub token scoped read/write to `ctc-scoring` only |
| `DROPLET_HOST` | the Droplet IP |
| `DROPLET_SSH_KEY` | private half of a **new** ed25519 key authorized only for `ctc-scoring` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ctc.runvaders.com` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the `ANON_KEY` from `gen-keys.sh` |

---

## The deploy script and deploy user

`deploy/deploy.sh` is food-shopper's with the paths changed. It sets `IMAGE_TAG=<sha>` in `.env`, then runs
`sudo docker compose -f /opt/ctc-scoring/docker-compose.yml pull`, then `up -d`, then `ps`.

The `ctc-scoring` user is SSH-key only, not in the `docker` group, and its sudo is limited to exactly
`docker compose -f /opt/ctc-scoring/docker-compose.yml {pull|up -d|down|restart|ps|logs}`.
That's why migrations run in the app's entrypoint instead of a `compose run migrate` step. `migrate.sh` is
copied as is: it applies `supabase/migrations/*.sql` in order and records each one in
`supabase_migrations.schema_migrations`, so a restart is a no-op.

**Migrations are append-only from now on.** The two existing files become the production baseline.
Never edit an applied migration; add a new one.

---

## nginx and TLS

A new vhost, `deploy/nginx-ctc.runvaders.com.conf`, installed by hand as root (the deploy user can't touch nginx).
It uses middle-school-track's certbot sequence, scoped to the one hostname:

1. DNS: an **A record `ctc` → Droplet IP** in the `runvaders.com` zone.
2. Install an HTTP-only vhost for `ctc.runvaders.com` that serves `/.well-known/acme-challenge/` from
   `/var/www/certbot`. `nginx -t && systemctl reload nginx`.
3. `certbot certonly --webroot -w /var/www/certbot -d ctc.runvaders.com`. This is a separate cert, so
   runvaders.com's cert isn't touched.
4. Replace the vhost with the full HTTPS config:
   - `listen 80` → 301 to https
   - `location /` → `127.0.0.1:8084` with `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` set. The
     magic-link callback builds its redirect from these headers.
   - `location ~ ^/(auth|rest|realtime)/` → `127.0.0.1:8085` with `proxy_http_version 1.1`,
     `Upgrade` / `Connection "upgrade"`, and `proxy_read_timeout 3600s`. Without the upgrade headers,
     Realtime silently never connects. This is food-shopper's snippet minus the upload size limit.
5. Renewal is handled by certbot's existing systemd timer on the Droplet, the same as for the other certs.

---

## Secrets on the Droplet

`/opt/ctc-scoring/.env`, mode 600, from `deploy/.env.example`. It's food-shopper's template trimmed:

- `DOCKERHUB_USERNAME=jschmitz`, `IMAGE_TAG` (rewritten by `deploy.sh`)
- `HOST_APP_PORT=8084`, `HOST_KONG_PORT=8085`
- `POSTGRES_HOST=db`, `POSTGRES_PORT=5432`, `POSTGRES_DB=postgres`, `POSTGRES_PASSWORD` (`openssl rand -hex 32`)
- `JWT_SECRET`, `JWT_EXPIRY=3600`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `REALTIME_SECRET_KEY_BASE` (from `deploy/gen-keys.sh`)
- `SITE_URL=https://ctc.runvaders.com`, `API_EXTERNAL_URL=https://ctc.runvaders.com`,
  `ADDITIONAL_REDIRECT_URLS=https://ctc.runvaders.com/**`
- `ENABLE_EMAIL_SIGNUP=true`, `ENABLE_EMAIL_AUTOCONFIRM=false`, `DISABLE_SIGNUP=false`, phone and anonymous off.
  Anyone can request a sign-in link, but only emails in the `staff` table can write (enforced by RLS).
  Turning signup off would mean inviting each volunteer through GoTrue instead.
- `SMTP_*`: **required**, because magic links are the only way to sign in. Reuse food-shopper's relay with
  `SMTP_SENDER_NAME=CTC Scoring`. Consider an `SMTP_ADMIN_EMAIL` on `runvaders.com` so links don't land in spam.
- `PGRST_DB_SCHEMAS=public,graphql_public`
- `RCLONE_REMOTE`: off-host backup target (see Backups)

---

## First-time setup (in order)

1. **Headroom check.** Run `free -h` and `docker stats --no-stream`, and resize the Droplet if needed (see "The Droplet").
2. **DNS.** Add the A record `ctc.runvaders.com` → Droplet IP, and wait until `host ctc.runvaders.com` resolves.
3. **Deploy user** (as root): `adduser --disabled-password ctc-scoring`, add the new public key to its
   `authorized_keys`, create `/etc/sudoers.d/ctc-scoring` with the scoped compose commands, and make
   `/opt/ctc-scoring` owned by `ctc-scoring`.
4. **Files.** Copy `docker-compose.yml` and `deploy/` (`deploy.sh`, `backup.sh`, `gen-keys.sh`,
   `crontab.example`, `volumes/`) to `/opt/ctc-scoring/`, with `deploy.sh` at `/opt/ctc-scoring/deploy.sh`.
5. **Secrets.** Run `./deploy/gen-keys.sh`, write `.env` from `deploy/.env.example`, then `chmod 600 .env`.
6. **GitHub secrets.** Set the six listed above. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` must equal `ANON_KEY`.
7. **nginx and cert.** Follow steps 2–4 under "nginx and TLS".
8. **First deploy.** Push to `main` and watch the workflow. On the Droplet:
   `sudo docker compose -f /opt/ctc-scoring/docker-compose.yml ps` shows only
   `127.0.0.1:8084` and `127.0.0.1:8085` published, and `logs app` shows both migrations applying.
9. **Bootstrap data** (once, as root, via `docker compose exec db psql`): run `deploy/bootstrap.sql`
   (see "Work to do"). It inserts the first staff email and the CTC 2026 event with its six challenges.
   Real teams are entered in Setup.
10. **Smoke test.** Open `https://ctc.runvaders.com/api/health` (200). Sign in with a real magic link,
    open the leaderboard on a phone, enter a test score on a laptop, and confirm it appears on the phone
    within a second. Then delete the test score.
11. **Backups.** Run `sudo crontab deploy/crontab.example` as root, then restore-test once (see below).

---

## Backups

`deploy/backup.sh` is food-shopper's with paths changed. It runs nightly as root via cron, does a
`pg_dump`, gzips it, keeps 14 dailies and 3 monthlies, and runs `rclone sync` off-host when `RCLONE_REMOTE`
is set. A DigitalOcean Spaces bucket in the same account is the natural target.

For this app, the backup that matters most is **the night after the event**. Also click
**Export CSV** on the score table when the last round is in; that file is the human-readable record.

Restore-test once before trusting it:
`gunzip -c <file> | docker compose exec -T db psql -U supabase_admin -d postgres` into a local stack.

---

## Rollback

Every image is tagged with its commit SHA:

```bash
/opt/ctc-scoring/deploy.sh <previous-sha>
```

This only works when the newer migrations were additive. Keep schema changes additive, especially in the weeks before an event.

---

## Event-day runbook

This app is idle all year and busy for one day, so it gets a checklist the other apps don't need.

**The week before**
- Deploy freeze from 3 days out: no pushes to `main`.
- Add every volunteer's email under Setup → Staff, and have each one sign in once on the device they'll use.
- Enter the teams with names and colors, then generate the rotation. Print the schedule (station and team pages).
- Check that emails arrive, including spam folders.
- Run a manual backup: `sudo /opt/ctc-scoring/deploy/backup.sh`.

**On the day**
- Set the event status to **Live** in Setup. This locks the rotation.
- Score table laptop: sign in and open the score table. Projector: open the leaderboard in Projector mode.
- Check the venue's Wi-Fi or cell signal. Keep a phone hotspot as a fallback.
- **Paper fallback:** printed per-station sheets. If the app is unreachable, stations keep scoring on
  paper, and the score table enters it afterward. Nothing about scoring depends on the app being up.

**After**
- Set status to **Final**, export the CSV, and run a backup.

---

## Work to do in this repo

Needed before the first deploy:

- [ ] `next.config.ts`: add `output: "standalone"`.
- [ ] `app/api/health/route.ts`: a database round trip through `/rest/v1/`, like food-shopper's.
- [ ] `Dockerfile`, `.dockerignore` (from food-shopper, npm instead of pnpm).
- [ ] `docker-compose.yml`: trimmed stack, no `container_name`, a realtime network alias, ports 8084/8085.
- [ ] `deploy/`: `deploy.sh`, `docker-entrypoint.sh`, `migrate.sh`, `gen-keys.sh`, `backup.sh`,
      `crontab.example`, `.env.example`, `nginx-ctc.runvaders.com.conf`, `volumes/db/*.sql`,
      `volumes/api/kong.yml`.
- [ ] `deploy/bootstrap.sql`: the CTC 2026 event and challenges from `supabase/seed.sql` (without
      the sample teams or `staff@example.com`), plus a placeholder for the first real staff email.
- [ ] `.github/workflows/deploy.yml`: `verify` then `ship`.
- [ ] README: link here, and drop the old Vercel-based "Deploying" section.

Nice to have:
- [ ] Playwright e2e for sign-in, score entry, and the live leaderboard, run in `verify` against `supabase start`.
- [ ] `CLAUDE.md` notes: migrations are append-only, deploy happens on push to `main`, and ports are 8084/8085.

## Open questions

- **Droplet RAM:** is there room for a second Supabase stack, or does it need a resize first?
- **SMTP:** reuse food-shopper's relay, or set up a sender on `runvaders.com`?
- **Off-host backups:** is there a Spaces bucket already, or does one need creating?
