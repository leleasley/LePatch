# Operations

## Backup & Restore

LePatch has an in-app backup UI at `Settings -> Backups` (admin only) that
creates and downloads database backups through a BullMQ job. The manual
commands below remain the fallback.

### Database Backup

```sh
docker compose exec -T postgres pg_dump -U lepatch lepatch > lepatch-db-$(date +%Y%m%d).sql
```

Note the `-T` flag — without it `docker compose exec` allocates a TTY and can
corrupt binary-safe dump output when piped.

### Database Restore

```sh
cat lepatch-db-20260101.sql | docker compose exec -T postgres psql -U lepatch -d lepatch
```

Stop the `lepatch` and `worker` services first, or they will keep writing while
you restore:

```sh
docker compose stop lepatch worker
# ... restore ...
docker compose start lepatch worker
```

### Application Data

Application state is stored in the PostgreSQL database and Redis.

- **PostgreSQL** holds all persistent state: users, sessions, trusted devices,
  passkeys, watched apps, releases, notification channels and
  events, tracked issues, GitHub links, audit log, and backups.
- **Redis** holds transient queue state and rate-limit counters. It is
  non-critical — queues are repopulated on demand, though rate-limit counters
  reset on flush.
- **`data/backups`** is a Docker volume (`backup-data`) holding generated backup
  files.

### Full Backup Strategy

1. Schedule daily `pg_dump` via cron or `docker exec`
2. Keep 7 daily, 4 weekly backups
3. Include the `backup-data` volume if you rely on in-app backup downloads
4. Test the restore procedure quarterly — a backup you have not restored is not a backup

---

## Dependency Updates

### Automated Workflow

1. **Check for stale packages**:

```sh
npm run deps:outdated
```

   Equivalent to `npm outdated --long`. Run it from the project root. To check
   inside the running container:

```sh
docker compose exec lepatch npm outdated
```

   Note the container image is built with `npm ci` and has dev dependencies
   pruned, so treat container-side output as indicative only.

2. **Audit**:

```sh
npm audit
```

3. **Update policy**:
   - Patch/minor bumps within the existing semver range (`npm update`): apply immediately, then run `npm run check`
   - Minor bumps that require a `package.json` range change: review the changelog, apply within a week
   - Major bumps: treat as a separate task with its own validation

4. **Prisma updates**: always run `npx prisma generate` after bumping Prisma
   packages, and check whether the schema needs a migration.

5. **After any dependency change**, validate with `npm run check` before building.

### A Note on `npm audit fix --force`

Do **not** run `npm audit fix --force` in this repo. It resolves transitive
findings by installing very old versions of major dependencies (it currently
proposes downgrading `prisma` by five majors). Apply the upgrades deliberately
instead.

Several audit findings are also not real production exposure and are safe to
defer: `valibot` and `@hono/node-server` are pulled in only by the Prisma
**CLI** (a dev dependency), and `sharp` arrives via Next's image optimization.
`sharp` is only exercised if you use `next/image` remote optimization.

The `overrides` block in `package.json` pins transitive versions of `postcss`
and `@hono/node-server`. When an advisory affects one of these, raise the floor
in `overrides` rather than adding a direct dependency.

### Security Advisories

1. Monitor GitHub Security Advisories for:
   - `next`, `react`, `react-dom` — framework
   - `prisma`, `@prisma/client` — database ORM
   - `bcryptjs`, `jose` — auth and session signing
   - `@simplewebauthn/*` — WebAuthn/passkeys
   - `bullmq`, `ioredis` — queue/Redis
   - `pg`, `zod` — database driver and validation

2. Apply critical CVEs within 48 hours, high within 1 week.

3. After any security patch:

```sh
docker compose build lepatch && docker compose up -d && docker image prune -f
```

---

## Docker Hardening

### Current Setup

- `postgres:16-alpine` — runs as the `postgres` user, non-root by default
- `redis:7-alpine` — runs as the `redis` user, non-root by default
- `lepatch` / `worker` — run as the image's built-in `node` user (UID 1000).
  `Dockerfile` sets `USER node` and chowns `/app/data`, `/app/.next` and
  `/app/public` so the app can still write backups and its build cache.

### Further hardening

1. **Restrict the published port** if the app is fronted by a reverse proxy, and
   set `TRUST_PROXY=true` only when that proxy is under your control.
2. **Add resource limits** (`deploy.resources.limits`) so a runaway worker
   cannot starve the host.
3. **Pin base images** to digests rather than floating tags for reproducible
   builds.
4. **Configure a log driver** (`logging: { driver, options }`) so container logs
   cannot fill the disk.

---

## Service Healthchecks

| Service | Check | Expected |
|---|---|---|
| `lepatch` | `GET /api/health` | `200 OK` |
| `lepatch` | `GET /` (login page) | `200` with HTML |
| `postgres` | `pg_isready -U lepatch -d lepatch` | accepting connections |
| `redis` | `redis-cli ping` | `PONG` |

Configuration lives in `docker-compose.yml`. The `lepatch` healthcheck runs
every 30s with a 30s `start_period`; after 3 consecutive failures Docker marks
the container unhealthy. `worker` has no healthcheck — it is a long-running
BullMQ consumer whose liveness you infer from queue depth and error logs.

### Queue health

Queue depth and job age are shown in the **Logs & Queues** admin page at
`/admin/logs` (there is no separate `/admin/queues` route). Failed jobs can be
cleared from there, or via `POST /api/admin/queues/clear-failed` (admin only,
CSRF-protected, and audited as `admin.queues_cleared`).

---

## Database Migrations

Apply migrations with the normal deploy flow:

```sh
docker compose exec lepatch npx prisma migrate deploy
```

This also runs automatically on container start. Never use `prisma db push` or
`prisma migrate dev` against a live database, and never edit
`prisma/migrations/` after it has been applied.

See `docs/roadmap.md` notes for migrations that changed the schema significantly.
