# Project Conventions

## Scope: What LePatch Is Today

LePatch is a **GitHub release monitoring and notification app**. It watches
repositories, classifies releases, tracks issues, and sends Discord/Telegram
notifications. Repository search and sponsored maintainers cover discovery.

It is **not** a server management product. The remote Go agent, the host-helper,
server/package scanning, and the agent self-update system were all **removed**.
Do not reintroduce them or write code that assumes them — see
[Removed Subsystems](#removed-subsystems) below.

## Build & Run

```bash
docker compose build lepatch && docker compose up -d && docker image prune -f
```

This rebuilds the image (reusing cached layers when files haven't changed), restarts the container, and removes the previous `lepatch-app:latest` image (which gets untagged when replaced). Use this any time you need to build and run the app.

Prefer `docker compose build` over `--build` flag — it reuses Docker layer cache, so unchanged stages (base, builder, runner) skip re-execution.

Periodically clean up old build cache to prevent disk bloat:

```bash
docker builder prune -af
```

### Local validation

```bash
npm run check   # lint + vitest + production build
```

There is no Go toolchain in this repo and no `check:go` script. If a task
appears to require Go tests or `agent/` sources, the task premise is stale —
re-read the repo before proceeding.

## CSRF Protection

Every mutation (POST/PUT/PATCH/DELETE) **must** include CSRF protection:

- **Client components**: import and use `csrfFetch` from `@/lib/csrf-client` instead of plain `fetch`. It automatically reads the CSRF token from the cookie and sets the `X-CSRF-Token` header.

  ```ts
  import { csrfFetch } from "@/lib/csrf-client";
  const res = await csrfFetch("/api/apps", { method: "POST", ... });
  ```

- **API routes**: validate the CSRF token at the top of every mutating handler using `validateCsrf` from `@/lib/csrf`.

  ```ts
  import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  ```

- **No Server Actions**: this codebase uses route handlers only. There is no
  `"use server"` file in `src/`. If you add one, it must still validate CSRF on
  the server side.

## DB & User Data — CRITICAL

**NEVER modify, delete, update, or create user records in the database directly.** This includes manually running seed scripts, migrations that affect user data, or any command that touches the `User`, `Session`, `PasskeyCredential`, or `TelegramLink` tables.

- The compose startup command runs `prisma/seed.ts`. That script is intentionally idempotent for users: it only creates the first admin when `User` is empty and never overwrites existing users. Do NOT run it manually against a live database. If you need to change seed behavior, modify `docker-compose.yml` or `prisma/seed.ts`, never the live database.
- If a user needs a password reset, provide them a CLI command to run themselves, or create a proper "forgot password" flow in the app. Do NOT hash and write passwords directly.
- **Never run `prisma db push` or `prisma migrate dev` as these can cause data issues.** Use proper migrations only.
- If you need to inspect the database, use read-only queries via `docker compose exec -T postgres psql`.

## Scaling & DB Call Performance

The app is optimized for adding more watched apps. Keep these rules in place:

- Do NOT return all `Release` rows from list endpoints or SSR pages. Paginate, filter, and sort at the database layer.
- Release checks are enqueued by the worker's 60-second scheduler with deliberate **jitter** so many apps do not all enqueue in the same minute. Preserve that jitter when touching `enqueueDueChecks()` in `src/worker/index.ts`.
- GitHub API calls are the main rate-limit risk. Keep them off hot paths and let the queues absorb bursts. If GitHub is down or rate-limited, code should degrade gracefully — keep showing the last known release data rather than failing the request.
- Release comparison uses the GitHub release **ID and tag name**, not semver sorting. Do not "fix" this to semver; see `src/lib/releases.ts`.
- Keep `cleanupExpiredRecords()` in `src/worker/index.ts` (6-hour interval) pruning expired `Session` and `TrustedDevice` rows so they do not grow unbounded.

### Queues

All queues live in `src/lib/queues.ts` and are accessed via lazy getters:

| Getter | Queue | Owner |
|---|---|---|
| `getReleaseCheckQueue()` | `release-check` | Scheduled/manual GitHub release checks |
| `getNotificationSendQueue()` | `notification-send` | Retryable Discord/Telegram sends |
| `getIssueCommentCheckQueue()` | issue comment checks | Tracked-issue comment polling |
| `getBackupQueue()` | backups | Database backup jobs |

## Logging

Use the project logger (`@/lib/logger`) instead of `console.log` / `console.error`.

```ts
import { logger } from "@/lib/logger";
logger.info("message");
logger.error("message", err);
logger.warn("message");
logger.debug("message"); // only shown in development
```

The logger outputs structured JSON so it plays well with log aggregators. It also bakes in timestamps and log levels automatically. Extra arguments are collected into a `data` field, and `Error` instances are serialized to `{ message, stack, name }`.

## Telegram Bot Configuration — DO NOT use systemSetting

Telegram bot settings (token, chatId, webhookSecret, enabled) live in
`prisma.integrationSetting` with `provider: "telegram"`, **NOT** in
`prisma.systemSetting`. Values are read through
`getIntegrationSettingValue("telegram", key)` from
`@/lib/integration-secrets`, which also transparently handles encryption for
settings marked sensitive. Always use the exported helpers:

```ts
import {
  sendTelegramBotMessage,
  getTelegramBotConfig,
  getTelegramRecipientChatIds,
} from "@/lib/telegram-bot";
```

### Correct pattern for notifications:

```ts
async function sendSomeNotification(...) {
  try {
    const config = await getTelegramBotConfig();
    if (!config.botToken) {
      logger.warn("Telegram notification skipped: bot token not configured");
      return;
    }
    // Resolve linked recipients (NOT just config.chatId)
    const recipients = await getTelegramRecipientChatIds(config.chatId || null);
    if (recipients.length === 0) {
      logger.warn("Telegram notification skipped: no recipients");
      return;
    }
    for (const chatId of recipients) {
      await sendTelegramBotMessage(config.botToken, chatId, message, "HTML");
    }
  } catch (err) {
    logger.error("Telegram notification failed", err); // NEVER silent catch {}
  }
}
```

**Key gotchas:**
- Do NOT send to `config.chatId` directly — use `getTelegramRecipientChatIds()`, which pulls linked chat IDs from `prisma.telegramLink` and falls back to the configured default only when there are no links.
- Do NOT use `prisma.systemSetting` for bot token/chatId — they are in `prisma.integrationSetting`.
- Always `logger.error()` in catch; silent `catch {}` hides breakage.
- When adding a new Telegram setting key, also register it in
  `encryptedIntegrationSettings` in `src/lib/integration-secrets.ts` if it holds
  a secret, so it is encrypted at rest and migrated from any plaintext value.
- The same pattern is used by the release notifications in `src/lib/notifications.ts`.

## Audit Log System

Every mutating administrative action should log an audit event via `createAuditLog` from `@/lib/audit`. The `AuditLog` table tracks who did what, on which target, with optional metadata and IP address.

### Key files:
- `prisma/schema.prisma` — `AuditLog` model (id, userId, action, target, targetId, metadata, ipAddress, createdAt)
- `prisma/migrations/20260622100000_add_audit_log/` — migration SQL
- `src/lib/audit.ts` — `createAuditLog()`, `getAuditLogs()`, `describeAction()`
- `src/app/api/admin/audit/route.ts` — paginated API endpoint (GET, admin-only via `requireAdmin`)
- `src/app/(app)/admin/audit/AuditClient.tsx` — client component with filtering, pagination, expandable metadata
- `src/app/(app)/admin/settings/SettingsTabs.tsx` — mounts `<AuditClient />` on the `audit` tab

### Audit UI location

The audit log is rendered as a **tab inside `/admin/settings`**, not at
`/admin/audit`. There is no `src/app/(app)/admin/audit/page.tsx` — the directory
holds only the client component. The audit API is separately available at
`GET /api/admin/audit` (admin-only).

### Logged actions:
| Action | Description |
|---|---|
| `user.login` / `user.logout` | Auth events |
| `user.created` / `user.updated` / `user.deleted` | User management |
| `user.password_reset` | Admin password reset |
| `app.created` / `app.updated` / `app.deleted` | Watched app CRUD |
| `app.check_triggered` | Manual release check |
| `settings.updated` | System settings change |
| `notification.created` / `notification.updated` / `notification.deleted` | Notification channels |
| `mfa.setup` / `mfa.disabled` | MFA lifecycle |
| `github.connected` / `github.disconnected` | GitHub account linking |
| `github.issue_created` / `.issue_tracked` / `.issue_untracked` / `.issue_commented` / `.issue_closed` / `.issue_reopened` | GitHub issue actions |
| `backup.created` / `backup.deleted` / `backup.downloaded` | Database backups |
| `admin.logs_cleared` / `admin.audit_cleared` / `admin.queues_cleared` / `admin.audit_view` | Admin panel actions |

### How to audit a new action:

```ts
import { createAuditLog } from "@/lib/audit";
import { requestIp } from "@/lib/auth";

// Fire-and-forget (failures must never break the request)
createAuditLog({
  userId: session.userId,
  action: "app.check_triggered",
  target: app.name,
  targetId: app.id,
  metadata: { /* optional structured data */ },
  ipAddress: requestIp(request),
}).catch(() => {});
```

### Rules:
- `createAuditLog` already try/catches internally, so it does not throw. The trailing `.catch(() => {})` is belt-and-braces — keep it.
- Use `requestIp` from `@/lib/auth` for the client IP.
- Use `session.userId` from `assertApiSession()`, or the id returned by `requireAdmin()` / `requireModerator()` / `getCurrentUser()` for the acting user.
- The `action` string should follow the `domain.verb` convention (e.g. `app.check_triggered`).
- The `target` field is a human-readable name, `targetId` is the DB record ID.

### Single source of truth for audit actions

`src/lib/audit-actions.ts` owns the `AuditAction` union and the `describeAction()`
label map. `src/lib/audit.ts` imports and re-exports both, so route handlers can
keep importing `createAuditLog` from `@/lib/audit` while the UI imports
`describeAction` from `@/lib/audit-actions`.

When you add a new action, edit **only** `src/lib/audit-actions.ts` — the union
and the `descriptions` record in the same file. Nothing else needs touching.

These definitions were previously duplicated in both files and had silently
drifted. Do not reintroduce a second copy.

## Removed Subsystems

These were removed by `prisma/migrations/20260902000000_remove_servers_github_only`
and `prisma/migrations/20260903000000_remove_tool_mappings`. Any task or
documentation that references them is stale:

- `agent/` (Go agent sources), `agent-builder` Docker stage, `/api/agent/download`,
  `/api/agent/ws`, `/api/agent/heartbeat`, `/api/agent/scan-result`,
  `/api/agent/binary-download`, `/api/agent/update`, `/api/agent/update-progress`
- `scripts/host-helper.mjs` and the `/api/admin/host` surface
- `src/lib/server-scan.ts` (`getToolMappings()`), the `ToolGitHubMapping` table
- `src/lib/agent-version.ts` and the agent version bump checklist
- All `/api/servers/*` routes, including `[id]/packages`, `stop-agent`, `update-agent`
- Dropped DB models: `Server`, `ServerPackage`, `ServerScan`, `UpdateJob`,
  `AgentCommand`, `AgentCapability`, `AgentLog`, `UpdateProposal`,
  `MaintenanceWindow`, `RolloutGroup`, `PackageDependency`,
  `PackageDaemonMapping`, `AlertHistory`, `ServerAlertConfig`, `PendingRestart`,
  `AdbDevice`, `SavedSubnet`, `DismissedFailedPackage`, `Tag`, `ServerTag`

One endpoint intentionally survives: **`GET /api/agent/uninstall`** (admin-only)
serves a one-time shell script that removes the retired agent binary, systemd
unit, and config from former hosts. It is cleanup tooling, not part of a running
feature — see `docs/agent-uninstall.md`. Do not add sibling agent endpoints.

If a feature request genuinely requires server management again, that is a
product decision requiring new migrations — not something to infer from this
document.

Server-era dead code has also been purged. Do not reintroduce these:

- `src/lib/docker-registry.ts`, `src/lib/risk-scoring.ts`, `src/lib/package-ui.ts`
  (container image scanning, package upgrade risk scoring, package display helpers)
- `src/components/CheckIntervalSelect.tsx` and `src/components/EmptyState.tsx`
- The `@dnd-kit/*` drag-and-drop dependencies — there is no reordering UI
- The `hostHelperSocket`, `encryptionKey`, and `nodeEnv` getters on `env` in
  `src/lib/env.ts`; code reads `process.env` directly
