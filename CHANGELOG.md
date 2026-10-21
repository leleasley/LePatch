# Changelog

All notable changes to LePatch are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The administrator console shows how many repositories include pre-releases
  and can exclude them from every repository in one step.

- Files in a repository you own can be edited in LePatch. The editor shows a
  live added and removed line count, `Cmd` or `Ctrl` plus `S` opens the commit
  dialog, and the dialog sets a commit message before writing. The commit goes
  to the default branch through the GitHub Contents API.
- Repository checks can run every 5 or 10 minutes, not only every 15 and up.
- A repository that is already watched shows a disabled "Watched" button on the
  repository page, in repository search, in the sponsored maintainers list and
  in your own repository list.
- Raised issues open inside LePatch. The issue page shows the state, author,
  labels, description and the whole comment thread, with GitHub kept as a
  secondary link.
- Comments can be written from the issue page and close or reopen it, so the
  thread no longer has to be finished on GitHub. The draft survives a failed
  post, `Cmd` or `Ctrl` plus `Enter` sends, and commenting marks the raised
  issue as read.
- Notification history rows open the release inside LePatch. The delivery log
  now carries the repository and release identity so it can navigate in app.
- Toasts are the single way the interface reports the result of an action:
  a coloured icon, a title, a message, a dismiss button and a progress bar,
  stacked above the phone bottom bar. Live events also raise a toast, so a new
  release, a failed check, a new issue comment or a failed delivery is visible
  from any page, and a dropped connection reports when it recovers.
- The repository README now has its own panel with the file name and a GitHub
  link, a readable measure, larger type on a phone, heading rules, inline
  badges, scrollable code blocks and tables, and collapsible sections.
- The watched repository cards are compact and clickable: the icon, name and
  actions share one row, the release and check time sit in a two column strip,
  and an Open affordance replaces the full width button.
- A rebuilt interface on a new design system: deep neutral surfaces with a
  single warm accent, Space Grotesk and DM Mono, a blurred top bar, a side
  navigation rail, a mobile bottom bar and a command palette on `Cmd`/`Ctrl`
  plus `K` for navigation, repositories and actions.
- Four appearances (`dark`, `midnight`, `oled`, `light`) that follow the
  account between devices through the new `PATCH /api/account` route.
- A release feed with working filters for stable, pre-release and unread
  entries, a list and grid layout, and inline actions to mark a release seen
  or ignore it.
- Per repository settings for the display name, check interval, pre-releases
  and notification delivery.
- An administrator console with workspace health, an enforced workspace
  defaults panel, integrations, users, delivery queues with a retry action,
  backups and the audit log, backed by `GET /api/admin/overview`,
  `GET`/`PUT /api/admin/settings`, `GET /api/admin/queues` and
  `POST /api/admin/queues/retry`.
- Workspace settings that the service enforces: the default check interval,
  the maximum number of watched repositories, the release feed size, the
  pre-release default and a maintenance notice.
- Release feed filtering that can include pre-releases and reports the update
  flag for each watched repository.
- Watched repository counts and active session counts on the user list.
- A build check that fails when a JSX component is used without being
  imported or declared.

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

- Telegram and Discord release alerts are compact cards now. A stable release
  is titled "New release detected"; a pre-release is titled "Pre-release
  detected", carries a pre-release chip and a warning line, and uses a
  different icon.
- The alert carries the release notes themselves, tidied into plain text and
  filled up to Telegram's 4 KB limit. When they do not fit, the button reads
  "Read the rest in LePatch" and opens that exact release inside the app; a
  second button opens GitHub.
- The accent colour is blue across every appearance. The previous amber accent
  is gone.
- Discord alerts are embeds, green for a stable release and amber for a
  pre-release, instead of a single line of markdown.
- Release summaries skip generated changelog noise such as "What's Changed",
  contributor lists and bare compare URLs, and prefer the stored summary.
- Pre-release detection recognises nightly, rc, beta, alpha, preview, canary,
  snapshot, dev, next, insiders, unstable and edge tags.
- The administrator "Send test" button sends a preview of the real release
  card rather than a plain test line, and the in-app delivery log labels each
  alert Release or Pre-release.
- The interface was rebuilt as a Vite and React app split into `components`,
  `pages` and `lib` modules with a token driven stylesheet, replacing the
  single 1080 line file and its minified stylesheet.
- The type scale was raised across the interface: the previous 8 to 11 pixel
  body text is now 13 to 16 pixels with 30 pixel page titles.
- Notification, discovery and repository actions report through a toast
  system and real dialogs instead of inline banners and `window.confirm`.
- The release poller reports its running state, queue depth, last schedule and
  last error so the administrator console can show service health.
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

### Fixed

- Release alerts called any tag containing `-nightly`, `-beta` and similar a
  pre-release even when GitHub published it as a normal release, so every
  nightly feed looked as if pre-releases had been switched on. The
  pre-release label now uses GitHub's own flag only.
- The appearance picked on a device was overwritten by the account theme on
  load, which made the theme picker look broken and forced the previous
  accent back after signing in. A local choice now wins and is pushed to the
  account; a device with no choice yet adopts the account theme.

- Release summaries read only the top line of a release body, which for
  generated notes was "What's Changed". They now skip generated headings and
  join the first few real lines of the opening paragraph.
- Short check intervals read "Every 1 hours" and "Every 1 days".
- Editing on a phone was unusable. Two causes: the page fade animation kept a
  transform on the page body, which made it the containing block for the
  dialog's `position: fixed` overlay and pushed the sheet off screen, and every
  text field was under 16px, which makes iOS zoom the page on focus. Dialogs
  now render through a portal on the body, the animation no longer leaves a
  transform, fields are 16px on a phone, the sheet keeps its Save and Cancel
  bar stuck to the bottom, and opening a dialog focuses the first field rather
  than the close button.- The watched repository card stretched its settings, refresh and delete
  buttons into a vertical column because the header rule matched the action
  cluster as well as the title block.
- The release poller used the shared installation GitHub token for every
  watched repository, so private and sponsored repositories answered with a
  404. It now uses the account's own linked GitHub token and falls back to the
  shared token.
- A repository GitHub cannot reach now explains why instead of reporting a
  bare HTTP status, and points at reconnecting GitHub when the connected
  token is missing the private repository scope.
- The GitHub sign in flow requested the `read:user` scope only, so the
  connected account could never read a private repository. It now requests
  `repo read:user`, which the account linking flow already asked for.
- The administrator console was unusable on a phone. The section navigation
  wraps into a grid, the user table becomes a card list, and the user creation
  form stacks instead of squeezing its fields.
- The side navigation was rebuilt, the top bar moved back to the right of it,
  and the phone safe areas are honoured so the dynamic island and the home
  indicator never cover the controls.
- The phone bottom navigation sent an administrator to the admin console
  instead of their profile.
- Dependabot upgrades: Node 26, Go 1.27 and Alpine 3.24 in the image, and
  `actions/checkout@v7`, `actions/setup-go@v7`,
  `docker/setup-buildx-action@v4`, `docker/login-action@v4` and
  `softprops/action-gh-release@v3` in the workflows.

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
