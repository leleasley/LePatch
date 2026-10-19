# Roadmap

## Backend and worker backlog

These worker defects are tracked for a later pass. They are intentionally not
part of the current UI work:

- Release notification digest delivery is incomplete or inconsistent.
- Tracked issue comment polling does not reliably detect new comments.
- `updateAvailable` is not cleared consistently after a release is acknowledged.
- Suppressed notifications can be recorded as sent.
- The seed/setup flag can be reset unexpectedly.

Fix these with runtime regression tests and preserve worker retry, jitter,
notification idempotency, user scoping, and secret handling.

## Product improvements

- Add changelog comparison and semver suggestions as a separate feature pass.
- Improve repository search filters and large-list navigation.
- Add download statistics where GitHub exposes reliable data.
- Give the administrator console per-user drill down for watched repositories
  and delivery history.
- Move the release feed onto a cursor so very large histories stay fast.

Server-management features are not planned for restoration.

## Delivered in the interface rebuild

- A rebuilt interface: design tokens, a blurred top bar, a side navigation
  rail, a mobile bottom bar and a command palette on `Cmd` or `Ctrl` plus `K`.
- A release feed with working filters, a list and grid layout, and inline
  actions to mark a release seen or ignore it.
- Per repository settings for the display name, check interval, pre-releases
  and notification delivery, all served by the existing repository API.
- An administrator console with workspace health, enforced workspace defaults,
  integrations, users, delivery queues with a retry action, backups and the
  audit log.
- The appearance now follows the account between devices.
