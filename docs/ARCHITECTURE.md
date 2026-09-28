# Deployment Architecture

What runs where, how requests move through it, and why it's shaped this way.
The step-by-step setup, secrets, and event-day runbook are in [DEPLOYMENT.md](DEPLOYMENT.md). This document is
the map that plan implements.

Status: **built, rehearsed locally, not yet on the Droplet.** `deploy/local/stack.sh` runs this exact
topology on a laptop, with an nginx container standing in for host nginx and Mailpit for SMTP (see DEPLOYMENT.md, "Rehearse locally").

---

## Summary

One Next.js container plus a slimmed-down self-hosted Supabase stack (Postgres, Auth, PostgREST, Realtime,
Kong), all in one Docker Compose project on the shared DigitalOcean Droplet. The host's nginx terminates TLS
for `ctc.runvaders.com` and splits traffic by path: pages go to the app, API calls go to Kong.

The browser talks to Supabase **directly** for data, writes, and live updates. The Next.js server
only renders pages, checks who's signed in, and completes magic-link sign-in. All authorization lives
in Postgres (row-level security plus two `SECURITY INVOKER` functions), so there's one place to get it right.

---

## Topology

```
                              Internet
                                 │  HTTPS 443  (80 → 301)
┌─ DigitalOcean Droplet (shared with 3 other apps) ──────────────────────────┐
│                                ▼                                           │
│  host nginx: TLS for ctc.runvaders.com (certbot); also serves the others   │
│       │ /                            │ /{auth,rest,realtime}/v1            │
│       ▼ 127.0.0.1:8084               ▼ 127.0.0.1:8085                      │
│ ┌─ compose project: ctc-scoring ─────────────────────────────────────────┐ │
│ │  app                      kong: apikey check, CORS, routing            │ │
│ │  Next.js 16 standalone      │ /auth        │ /rest        │ /realtime  │ │
│ │  + migrate.sh on start      ▼              ▼              ▼            │ │
│ │    │                      auth           rest           realtime       │ │
│ │    │                      GoTrue         PostgREST      (WebSocket)    │ │
│ │    │ psql                   │              │              ▲            │ │
│ │    │ (on start)             │              │              │ WAL        │ │
│ │    ▼                        ▼              ▼              │            │ │
│ │  db  supabase/postgres ◀────┴──────────────┴──────────────┘            │ │
│ │      volume: db_data                                                   │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  cron (root): backup.sh nightly → pg_dump.gz → rclone → Spaces bucket      │
└────────────────────────────────────────────────────────────────────────────┘
      │ SMTP 587 (auth → relay)                      ▲ docker pull
      ▼                                              │
  email relay (magic links)        Docker Hub: jschmitz/ctc-scoring:<sha>
                                                     ▲
                                   GitHub Actions: verify → ship → ssh deploy.sh
```

### Components

| Component | Image | Role | Exposed |
|---|---|---|---|
| host nginx | (Droplet package) | TLS, HTTP→HTTPS, path routing, WebSocket upgrade | `:80`, `:443` public |
| `app` | `jschmitz/ctc-scoring` | Server-renders pages, runs `proxy.ts` session refresh, `/auth/callback`, `/api/health`. Applies migrations before starting. | `127.0.0.1:8084` |
| `kong` | `kong:2.8.1` | API gateway: checks the `apikey`, sets CORS, routes to auth, rest, and realtime | `127.0.0.1:8085` |
| `auth` | `supabase/gotrue` | Magic-link sign-in, issues and refreshes JWTs, sends email over SMTP | compose network only |
| `rest` | `postgrest/postgrest` | Every table read and write, plus the `save_score` / `replace_rotation` RPCs | compose network only |
| `realtime` | `supabase/realtime` | Pushes `scores` and `events` changes to browsers over WebSocket. Reached through the network alias `realtime-dev.ctc-realtime`, because it reads its tenant from the hostname and food-shopper already owns the usual container name. | compose network only |
| `db` | `supabase/postgres` | All state. RLS enforces permissions. | compose network only |

Deliberately **not** run: Storage and imgproxy (no uploads), Studio and meta (no dashboard in production),
edge functions, and analytics. Each is a container that would cost RAM on a shared box and do nothing here.

### Ports on the shared Droplet

| 127.0.0.1 port | Owner |
|---|---|
| 8080 | family-scheduler |
| 8081 | middle-school-track |
| 8082 / 8083 | food-shopper app / kong |
| **8084 / 8085** | **ctc-scoring app / kong** |

---

## Request flows

### 1. Public page load (leaderboard, schedule)

```
browser ──GET /event/<id>/leaderboard──▶ nginx ──▶ app   (HTML + JS; no data yet)
browser ──GET /rest/v1/{events,challenges,teams,rotation_slots,scores}──▶ nginx ──▶ kong ──▶ rest ──▶ db
browser ──WSS /realtime/v1/websocket──▶ nginx ──▶ kong ──▶ realtime   (subscribe: scores, events for this event)
```

The page is a thin client shell. `useEventData` fetches the five tables in parallel as `anon`.
RLS lets `anon` read everything, which is intentional: standings and schedule are public.

### 2. Staff sign-in (magic link)

```
browser ──POST /auth/v1/otp {email}──▶ kong ──▶ auth ──SMTP──▶ inbox
inbox link ──▶ /auth/v1/verify ──▶ auth ──302──▶ https://ctc.runvaders.com/auth/callback?code=…
app /auth/callback ──exchangeCodeForSession──▶ kong ──▶ auth
app ──302 + Set-Cookie (session)──▶ browser ──▶ /score/<id>
```

- PKCE: the code verifier is set as a cookie by the browser client and read by the server route. That's why the callback
  must land on the same host the browser started from. It builds the redirect from `X-Forwarded-Host` /
  `Host`, which nginx must pass through.
- Anyone can request a link, and GoTrue creates the user. Being signed in grants nothing. **Staff** is
  the `staff` table, checked by `is_staff()`.
- Sessions refresh through `auth` without email, so staff who sign in the day before stay signed in
  even if SMTP has problems on event day.

### 3. Staff page load (score table, setup)

```
browser ──GET /score/<id>──▶ nginx ──▶ app
    proxy.ts: refresh session cookie (auth.getClaims)          ──▶ https://ctc.runvaders.com/auth/v1 …
    page:     requireStaff() → getClaims + rpc('is_staff')      ──▶ https://ctc.runvaders.com/rest/v1 …
  ◀── HTML, or redirect to /login, or "Staff only"
```

The server-side Supabase client uses the **public** URL, so these calls leave the container and go back in
through nginx (a hairpin). That's correct and simple, and it costs a few milliseconds per staff page load.
If it ever matters, add a server-only `SUPABASE_INTERNAL_URL=http://kong:8000` and use it in
`lib/supabase/server.ts` and `proxy.ts`.

The page check is a UX gate. The real enforcement is RLS on every write.

### 4. Score entry, then live fan-out

```
score table ──POST /rest/v1/rpc/save_score {team, challenge, counts, notes}──▶ kong ──▶ rest ──▶ db
      save_score (SECURITY INVOKER): is_staff()? → validate components → compute total
                                     → upsert scores + score_components (one transaction)
db ──WAL──▶ realtime ──WS "scores changed"──▶ every open leaderboard / score table / schedule
each client ──GET the 5 tables again──▶ rest            (useEventData.reload)
```

- **The total is computed in Postgres**, from `scoring_components.points`. The client's preview total is
  only for display, so a stale or tampered client can't store a wrong total.
- The fan-out is "notify, then refetch everything". It's simple and always consistent, at the cost of
  amplification: one save → *N* clients × 5 small queries. See Capacity.

### 5. Deploy

```
push main ─▶ Actions verify (tsc, lint, vitest, next build)
          ─▶ Actions ship: buildx linux/amd64 → Docker Hub :<sha>, :latest
          ─▶ ssh ctc-scoring@droplet /opt/ctc-scoring/deploy.sh <sha>
                IMAGE_TAG=<sha> → compose pull → compose up -d
                   app container recreated → entrypoint: migrate.sh → node server.js
```

Only `app`'s image changes on a normal deploy, so `up -d` recreates just that container. The Supabase
services and the database are left running.

---

## Trust boundaries and security

| Boundary | Control |
|---|---|
| Internet → Droplet | DigitalOcean Cloud Firewall: 22, 80, 443 only. SSH by key. |
| nginx → containers | Everything binds `127.0.0.1`. Only `app` and `kong` publish ports at all. |
| Browser → API | Kong `key-auth` with the anon key (public by design; it identifies the project, not a user) plus a user JWT when signed in |
| API → data | **RLS on every table.** `anon` and non-staff can read and can't write. Staff (`is_staff()`) can write. |
| Privileged operations | `save_score` and `replace_rotation` are `SECURITY INVOKER` and re-check `is_staff()`. `replace_rotation` also refuses once the event is `live`. Only `is_staff()` is `SECURITY DEFINER`, with a pinned empty `search_path`. |
| Deploy identity | `ctc-scoring` user, not in the `docker` group. Sudo limited to `docker compose -f /opt/ctc-scoring/docker-compose.yml {pull,up -d,down,restart,ps,logs}`. |
| Secrets | `/opt/ctc-scoring/.env` (600) on the Droplet, and GitHub Actions secrets. The image contains no secrets; the only baked-in values are the public URL and anon key. |
| Service role key | Used only by Kong and the Supabase services. The app never uses it. |

**Why public read is acceptable:** the data is team names, captains' names, and scores, the same things
shown on the projector in the room. Captains' names are optional, and Setup doesn't require them. Don't enter
anything about students beyond what would be read out loud at the event.

---

## Data and persistence

| Data | Where | Durability |
|---|---|---|
| Events, challenges, teams, rotation, scores, staff | `db` → Docker volume `db_data` | Survives container and image replacement. **Lost if the Droplet is destroyed**, so rely on backups. |
| Auth users and sessions | `db` (`auth` schema) | Same |
| Nightly dumps | Backup directory on the Droplet → `rclone` → DigitalOcean Spaces | 14 dailies and 3 monthlies locally, off-host copy |
| Post-event record | CSV from the score table's **Export CSV** | Human-readable, kept by the organizer |

Schema changes arrive only as new files in `supabase/migrations/`, applied in filename order by
`migrate.sh` and tracked in `supabase_migrations.schema_migrations`. They're append-only, and
additive changes keep image rollback safe.

---

## Capacity

The load pattern is a year of near-zero traffic, then one day with a few writers and many readers.

- **Writers:** 1–3 score-table laptops, about 50–100 saves over the whole event (teams × challenges).
- **Readers:** the projector plus parents' phones, roughly 50–200 open leaderboards at peak.
- **Fan-out per save:** about 200 clients × 5 queries ≈ 1,000 small PostgREST reads in a burst of a second or two.
  That's comfortable for PostgREST and Postgres on a shared Droplet, and saves are minutes apart.
- **Realtime:** one WebSocket per open page. A couple of hundred is well within one Realtime node.

The binding constraint is **Droplet RAM** (a second Supabase stack next to food-shopper's), not traffic.
Measure headroom before first boot (DEPLOYMENT.md, "The Droplet"). If leaderboard audiences ever reach thousands,
the first change is to refetch only `scores` on a change event instead of all five tables.

---

## Failure modes

| What fails | What users see | Mitigation |
|---|---|---|
| Venue Wi-Fi / cell | Nothing loads at the venue | Phone hotspot for the score table. Paper per-station sheets; enter them later. |
| Droplet down | Whole site down | Same paper fallback. Restore to a new Droplet from the Spaces backup. |
| `app` container | Pages won't load. The API may still answer. | `restart: unless-stopped`, `/api/health` healthcheck. Roll back with `deploy.sh <previous-sha>`. |
| `kong` / `rest` / `db` | Pages load but show "Couldn't load the event" | `restart: unless-stopped`. Check `docker compose logs`. |
| `realtime` only | Leaderboard stops updating live, but a reload shows current data | Reload the projector page. Fix at leisure; nothing is lost. |
| SMTP relay | New sign-ins fail. Existing sessions keep working. | Everyone signs in on their device the day before (runbook). |
| Bad migration | App container fails to start (entrypoint exits) | The previous container is already gone, so fix forward or restore. Deploy freeze 3 days before the event. |
| Certificate expiry | Browser TLS error | certbot's systemd timer. Check `certbot certificates` in the week before. |

---

## Why this shape

- **Self-hosted Supabase, not Supabase Cloud.** It matches food-shopper, so there's one pattern on the
  Droplet. There's no free-tier pause to remember before a once-a-year event, and no external dependency
  besides SMTP. The cost is RAM and running our own backups.
- **Its own Supabase stack, not a schema in food-shopper's.** Deploys, migrations, backups, and failures
  stay independent. A bad food-shopper migration can't take the scoreboard down on event day.
- **Browser talks to Supabase directly.** Realtime needs the browser connected anyway, RLS makes it safe,
  and it keeps the Next.js server almost stateless: no API layer to write, secure, or scale.
- **Totals computed in the database.** One source of truth for scoring rules (`scoring_components`),
  enforced where the data lives.
- **Migrate on container start.** It's the only way to run migrations under a deploy user whose sudo
  allows `up -d` but not `run` (food-shopper's reasoning, adopted as is).
- **Same origin for app and API** (`ctc.runvaders.com` for both). This avoids CORS preflights and
  cookie-domain questions, and keeps a single TLS cert.

## Related

- [DEPLOYMENT.md](DEPLOYMENT.md): setup steps, secrets, backups, rollback, event-day runbook
- `docker-compose.yml`, `deploy/`: the stack, scripts, nginx vhosts, and `deploy/local/` for local rehearsal
- `supabase/migrations/`: schema, RLS policies, `save_score`, `replace_rotation`
- food-shopper `docs/DEPLOYMENT.md`: the reference implementation this follows
