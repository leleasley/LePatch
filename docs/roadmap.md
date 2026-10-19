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

- Continue improving the repository workspace and mobile layouts.
- Add changelog comparison and semver suggestions as a separate feature pass.
- Improve repository search filters and large-list navigation.
- Add download statistics where GitHub exposes reliable data.

Server-management features are not planned for restoration.
