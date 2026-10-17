# LePatch Roadmap

This document tracks the phased roadmap and current completion state.

> **Note:** Phases 3, 4, and part of 5 described a server-management product.
> That subsystem (remote Go agent, host-helper, package scanning, agent fleet
> tooling) was removed by `prisma/migrations/20260902000000_remove_servers_github_only`
> and `20260903000000_remove_tool_mappings`. Those items are retained below as
> historical record and marked **retired**. LePatch is now GitHub release
> tracking only.

## Phase 1: Cleanup And Guardrails

- [x] Clean the lint warning backlog.
- [x] Tighten ESLint back toward errors.
- [x] Expand route-security test to check auth/admin/agent/webhook categories.
- [x] Add audit coverage tests for mutating admin/server routes.
- [x] Resolve seed policy mismatch between `AGENTS.md`, `docker-compose.yml`, and `README`.
- [x] Add CI-style validation scripts/checklist.
- [x] Retry dependency update check.

Status: Complete.

## Phase 2: Security And Access Control

- [x] Add explicit API wrappers: user mutation, admin mutation, setup request, webhook request.
- [x] Keep RBAC to `Administrator`, `Moderator`, `User`, and `Restricted`.
- [x] Enforce `Restricted` so it can browse repository search and preview flows but cannot manage apps or reach admin pages.
- [x] Encrypt integration secrets at rest and migrate old plaintext values.
- [x] Encrypt notification channel secrets at rest.
- [x] Add rate limits to GitHub-backed user APIs.
- [x] Add broader rate limits to WebAuthn option generation and the Telegram webhook.
- [x] Add stronger destructive-action confirmations.
- [x] Sign or secret-validate Telegram webhook handling.

Status: Complete.

## Phase 3: Update Workflow — RETIRED

The following were built for managing package updates on remote servers and no
longer apply. Do not re-add without a new product decision.

- [~] ~~Add maintenance windows.~~ *retired with the server subsystem*
- [~] ~~Add staged rollouts.~~ *retired with the server subsystem*
- [~] ~~Add update proposal model.~~ *retired with the server subsystem*
- [~] ~~Add update risk scoring.~~ *retired with the server subsystem*
- [~] ~~Add rollback/runbook display.~~ *retired with the server subsystem*

Status: Retired. `MaintenanceWindow`, `RolloutGroup`, `UpdateProposal`, and
`UpdateJob` tables were dropped.

## Phase 4: Fleet Operations — RETIRED

Built for managing a fleet of remote servers.

- [~] ~~Build fleet health page.~~ *retired*
- [~] ~~Add agent command timeline.~~ *retired*
- [~] ~~Add command output streaming/chunked polling.~~ *retired*
- [~] ~~Add per-agent diagnostics.~~ *retired*
- [~] ~~Add agent capability reporting.~~ *retired*
- [x] Add host-helper health view. *(the host-helper itself was later removed; this is moot)*

Status: Retired.

## Phase 5: Observability

Still applicable, minus the server-side items.

- [x] Add alert history. *(table later dropped with server subsystem)*
- [x] Add metrics retention controls.
- [ ] Add CPU/memory/disk/load/process charts. — **dropped** (server-only metrics)
- [x] Add queue age and stuck-job detection. *(surfaces inside `/admin/logs`)*
- [x] Add saved filters/export for `/admin/logs`.
- [x] Add correlation IDs.

Status: Complete for the current product.

## Phase 6: Notifications

- [x] Add per-user notification preferences.
- [x] Add quiet hours.
- [x] Add severity filters.
- [x] Add digest notifications.
- [x] Add escalation rules.
- [x] Add delivery history.

Status: Complete.

## Phase 7: Release Intelligence

- [x] Classify releases.
- [x] Improve changelog parsing.

Status: Complete.

## Phase 8: Testing

- [x] Add API tests for package pagination/filter/sort.
- [x] Add API tests for update job lifecycle → **retired** with the server subsystem.
- [x] Add OpenCode asset selection tests for the agent path. → **retired** with the agent; no such test exists now.
- [x] Add OpenCode asset selection tests for the host-helper path. → **retired** with the host-helper; no such test exists now.
- [x] Add responsive Playwright smoke tests for the 360px, 390px, 768px,
  1024px and 1440px layouts.

Current suite: 15 test files / 123 tests covering CSRF, audit, encryption,
integration secrets, notifications, GitHub commits, HTTP helpers, private repo
access, route security, UI cache state, and slugs. Run with `npm test`.

Status: Complete.

## Phase 9: Deployment And Ops

- [x] Add service healthchecks.
- [x] Review Docker hardening.
- [x] Add backup/restore docs and in-app backup UI.
- [x] Add dependency update workflow (`npm run deps:outdated`).
- [x] Add security advisory workflow.
- [x] Run the app containers as a non-root user (`USER node`).
- [ ] Pin base image tags/digests in `Dockerfile` and `docker-compose.yml`.

Status: Mostly complete; two hardening items open.

## Current Priorities

1. Add resource limits and pinned base-image digests (see `docs/operations.md`).
2. Apply pending dependency updates — see the audit findings in `docs/operations.md`.

## Phase 2: Product enhancements

- [x] Desktop command palette and quick check-all action.
- [x] Search, repository filters and paged watched-app loading.
- [ ] Suggest the next semver tag from the previous release.
- [ ] Compare changelog notes between releases.
- [ ] Add clearer draft and pre-release workflow states.
- [ ] Show GitHub asset download statistics.

## Worker Backlog

These worker and notification defects were identified during the frontend audit.
They are intentionally deferred from the UI rebuild:

- Fix digest scheduling so deferred notifications eventually deliver, and make
  sure the triggering release is included in the digest message.
- Track issue comments by processed comment IDs or a reliable timestamp so
  polling neither repeats old comments nor skips new ones.
- Preserve `updateAvailable` until the user acknowledges the release.
- Represent filtered or muted notifications as suppressed rather than sent.
- Preserve existing notification-channel enabled flags during startup seeding.

## Completed Cleanup

Removed as dead weight from the server-management era:

- `src/lib/docker-registry.ts`, `src/lib/risk-scoring.ts`, `src/lib/package-ui.ts`,
  `src/components/CheckIntervalSelect.tsx`, `src/components/EmptyState.tsx` — all
  unreferenced
- Empty directories `src/components/charts/`, `src/app/(app)/admin/queues/`,
  `src/app/api/notifications/[id]/`
- Dead `env` getters `hostHelperSocket`, `encryptionKey`, `nodeEnv`
  (code reads `process.env` directly)
- Phantom audit actions `tag.*` (dropped with the `Tag`/`ServerTag` tables) and
  `adb.apk_pushed` (dropped with `AdbDevice`) — neither was ever logged
- Duplicated `AuditAction` / `describeAction` definitions collapsed into
  `src/lib/audit-actions.ts`
- Unused dependencies `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

## Notes

- Phase 2 introduced a Prisma migration for the new roles:
  `prisma/migrations/20260626100000_expand_user_roles/`
- The server-management removal is
  `prisma/migrations/20260902000000_remove_servers_github_only/` followed by
  `20260903000000_remove_tool_mappings/`.
- Apply migrations with the normal deploy flow (`prisma migrate deploy`). Do not
  use `prisma db push` or `prisma migrate dev`.
