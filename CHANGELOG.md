# Changelog

All notable changes to LePatch are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Phone-first bottom navigation, rich mobile release/app cards, light and dark
  citrus themes, offline feedback, and safe-area-aware action sheets.
- Account-scoped Redis/SSE live updates for discovered releases and completed
  checks, with a five-connection cap and reconnect fallback.
- Installable PWA shell with correctly sized icons, iOS startup images, and
  useful offline precaching.
- Optimistic watched-app changes with rollback and SWR pagination.
- Command palette (`Cmd`/`Ctrl`+`K`) for navigation and quick actions.
- Dense release table with type and notification badges, relative timestamps,
  filters and keyboard-expandable release notes.
- Component library with a single token scale: Button, Card, Badge, Input,
  Select, Switch, Tabs, Breadcrumbs, EmptyState, ErrorState, Skeletons and an
  accessible ModalShell.
- `system` theme that follows the operating system preference.
- Shared pagination helper; the watched-app and release list endpoints are now
  paginated.
- Retention pruning for releases, notification events, audit logs and burnt
  Telegram link tokens.
- Graceful worker shutdown so restarts do not kill in-flight notifications.
- Test coverage for release classification, changelog parsing, OAuth state
  signing, pagination, UI state transitions and quiet-hours/digest windows.
- CI runs lint, typecheck, tests, a production build and a Docker image build.

### Changed

- Rethemed to one neutral palette with a single accent. Dark and light are both
  designed from the same tokens.
- Themes reduced from ten to three (`dark`, `light`, `system`). Eight of the old
  themes never defined status, divider or shadow tokens.
- Notifications are routed per user and honour preferences, quiet hours,
  severity filters and digest intervals.
- Queue jobs retry with backoff, carry stable job IDs and are pruned, so
  delivery is idempotent and Redis does not grow forever.
- Release checks use bulk inserts instead of 60 sequential queries per app.
- The GitHub OAuth state is HMAC-signed and the linking user comes from the
  live session.
- MFA enrolment keeps the pending secret server-side.

### Removed

- The catalogue subsystem (models, queue, worker, admin screens, suggestions).
  Repository search covers discovery; there is nothing to curate.
- Legacy `/api/notifications` GET/PUT, which returned decrypted channel secrets
  to any authenticated user.
- Dead code: `IssueDetail`, `ReleaseActions`, the forked `UsersClient`, the
  unreferenced `mfa-check` route, the orphaned delivery-history page, and the
  server-era fields still serialised to the client.
- Server-side QR generation via `api.qrserver.com`; QR codes are rendered in the
  browser so MFA seeds stay on the device.

### Fixed

- All rate limits were bypassable: the Redis client never connected and
  `X-Forwarded-For` was trusted without `TRUST_PROXY`.
- WebAuthn origin binding used attacker-controlled request headers.
- Any authenticated user could read the Discord webhook URL and Telegram bot
  token and rewrite global notification channels.
- `/api/setup/test` was an unauthenticated SSRF and `/api/setup/complete` could
  create two administrators under a race.
- Admin password resets left the target's sessions and trusted devices active.
- Release classification mislabelled `v2`, `V2.0.0` and `release-2.0.0`, and
  changelog parsing discarded everything before the first heading.
- `handleApiError` returned internal error text (Prisma, encryption) to clients.
- Trusted-device revocation was not scoped to the caller.
- The commits API did not check watched-app ownership.

[Unreleased]: https://github.com/OWNER/lepatch/commits/main
