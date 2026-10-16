# LePatch

LePatch is a self-hosted **GitHub release monitoring and notification app**. It
watches repositories, classifies releases, surfaces interesting ones, tracks
issues, and sends Discord or Telegram notifications when attention is needed.

LePatch tracks and notifies. It does **not** deploy or install updates, and it
does **not** manage remote servers. There is no agent, no host-helper, and no
package manager integration. Release detection never triggers an automatic
install — anything that changes a system requires an explicit human action.

## Stack

- Next.js (App Router), TypeScript, Tailwind CSS
- PostgreSQL with Prisma
- Redis and BullMQ workers
- Local admin login with bcrypt password hashes, TOTP MFA, and WebAuthn passkeys
- Discord webhook and Telegram bot notifications
- GitHub REST/GraphQL APIs for releases, commits, issues, and repo metadata

## Quick Start

1. Create `.env` from the example:

```bash
cp .env.example .env
```

2. Edit at least these values:

```env
SESSION_SECRET=replace-with-a-long-random-secret
ENCRYPTION_KEY=replace-with-a-32-byte-minimum-secret
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=replace-me
GITHUB_TOKEN=
APP_URL=http://your-server-ip:3000
```

`ENCRYPTION_KEY` encrypts notification channel secrets at rest and cannot be
changed later without re-entering those secrets. `GITHUB_TOKEN` is optional but
strongly recommended — unauthenticated GitHub API calls are rate limited to 60
per hour.

3. Start LePatch:

```bash
docker compose up -d
```

4. Open `http://your-server-ip:3000` and sign in with `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD`.

## Migrations and Admin User

The compose command runs Prisma migrations and then runs `prisma/seed.ts` automatically. The seed script only creates the first admin when the `User` table is empty, and it never overwrites existing users.

For maintenance, run migrations only:

```bash
docker compose exec lepatch npx prisma migrate deploy
```

Do not manually run the seed script against a live database unless you are deliberately changing first-run bootstrap behavior.

Never use `prisma db push` or `prisma migrate dev` against a real database —
write a proper migration instead.

## Validation

```bash
npm run check
```

This runs ESLint, the Vitest suite, and a production build. There is no Go
toolchain in this repository.

## Logs

```bash
docker compose logs -f lepatch
docker compose logs -f worker
```

Both services emit structured JSON logs. See `AGENTS.md` for the logging
convention used in code (`@/lib/logger`).

## Updating LePatch

```bash
git pull
docker compose build lepatch
docker compose up -d && docker image prune -f
```

Migrations run automatically on container start via the compose `command`.

## Notifications

Discord and Telegram Bot can be configured in the LePatch UI. Environment
variables can seed initial channel settings:

```env
DISCORD_WEBHOOK_URL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Channel secrets (webhook URLs, bot tokens) are encrypted at rest with
`ENCRYPTION_KEY` before being written to the database.

## Telegram Bot

LePatch includes a shared Telegram Bot for all users.

Setup:

1. Create a bot with `@BotFather`
2. Configure the bot token in LePatch under `Settings -> Telegram Bot`
3. Set the webhook from the same screen after `APP_URL` is publicly reachable over HTTPS
4. Users link from `Settings -> Security -> Telegram Bot Access`
5. The user sends `/link CODE` to the bot in a private Telegram chat

Notes:

- Link codes are single-use, 8 characters, and valid for 10 minutes
- One bot serves all LePatch users
- Linked users receive Telegram Bot release alerts directly
- `TELEGRAM_CHAT_ID` is optional and acts only as a fallback broadcast destination
- One bot can send both release alerts and interactive callbacks (e.g. starring a repo from the bot)

Secrets are not printed by the app. For a production install, use strong random values for `SESSION_SECRET` and `ENCRYPTION_KEY`, keep `.env` private, and expose only the Next.js app port.

## Worker Behavior

The worker owns five BullMQ queues:

| Queue | Purpose |
|---|---|
| `release-check` | Scheduled and manual GitHub release checks |
| `notification-send` | Retryable Discord and Telegram sends |
| `catalogue-stats` | Refreshes star counts and latest release for catalogue entries |
| issue comment checks | Polling for comments on tracked issues |
| backups | Database backup jobs |

Schedulers run on a 60-second tick with deliberate jitter so many watched apps do
not all enqueue in the same minute. A 6-hour cleanup job prunes expired
sessions and trusted devices.

Watched apps use a 360 minute check interval unless changed. GitHub release
comparison uses the GitHub release ID and tag name, not semantic version sorting.

## Security Notes

- Dashboard routes and API routes require a session. Admin routes require an admin role.
- Roles are `Administrator`, `Moderator`, `User`, and `Restricted`. A `Restricted` user can browse the app catalogue and repo preview flows but cannot manage watched apps or reach admin pages.
- Login is rate limited to 10 attempts per minute per client IP (Redis-backed, with an in-process fallback).
- MFA code entry is limited to 5 attempts per 15 minutes per user.
- Additional rate limits cover GitHub-backed endpoints, package search, WebAuthn option generation, and the Telegram webhook.
- Passwords are stored as bcrypt hashes.
- Session cookies are HTTP-only and secure in production.
- Notification channel secrets and integration secrets are encrypted at rest.
- Mutating browser requests use CSRF protection.
- Administrative actions are recorded in the audit log (viewable at `Settings -> Audit Log`).
- Security response headers are set centrally in `src/lib/security-headers.ts`.
- Release checks never auto-install or deploy anything.

## Retired: Server Management

Earlier versions of LePatch managed remote servers via a Go agent and a local
host-helper, and scanned host packages for updates. Both were removed when the
product pivoted to GitHub release tracking only.

Hosts that still run the old agent can remove it with:

```sh
curl -fsSL https://your-lepatch-host/api/agent/uninstall | sh
```

See `docs/agent-uninstall.md`. No re-pairing or server record is needed
afterwards — those tables no longer exist.

## Further Reading

- `AGENTS.md` — development conventions and invariants
- `docs/operations.md` — backup/restore, dependency updates, Docker hardening
- `docs/roadmap.md` — feature status
- `docs/agent-uninstall.md` — removing the retired agent