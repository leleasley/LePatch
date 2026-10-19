# Contributor instructions

## Product and architecture

LePatch is a self-hosted GitHub release monitor. It watches repositories,
tracks releases and issues, and sends Discord or Telegram notifications. GitHub
search and sponsored maintainers cover discovery.

The active service is Go in `cmd/lepatch`. Its Vite-built web UI is in `ui/` and
is embedded from `internal/web/dist`. The importer in `cmd/lepatch-import` is a
one-time PostgreSQL-to-SQLite tool. SQL files under `prisma/migrations/` are
historical records only; the Go service does not run Prisma.

## Build, test, and run

```sh
npm ci --prefix ui
npm run build --prefix ui
go test ./...
go vet ./...
```

Run locally with `go run ./cmd/lepatch`. The Docker deployment is:

```sh
docker compose build lepatch
docker compose up -d
```

## Application versions and releases

- `VERSION` is the current local app version without a leading `v`. Update it
  with `scripts/set-version.sh 0.1.0` when a release is prepared; do not bump
  it just for routine development changes.
- The UI reads the running version from the Go binary. Docker builds use
  `VERSION` by default; `APP_VERSION` can override it for a release build.
- A `vX.Y.Z` tag triggers `.github/workflows/release.yml` to build binaries,
  publish a GitHub release, and push the matching container to GHCR. Only push
  a version tag when the release is explicitly ready. Pushing `main` alone
  never publishes a release.

For a normal install, `docker-compose.yml` pulls
`ghcr.io/leleasley/lepatch:${LEPATCH_VERSION:-latest}`. Set `LEPATCH_VERSION` in
`.env` to pin a release. GHCR images are published by a version tag; until the
first release, build the checkout with both files:

```sh
docker compose -f docker-compose.yml -f docker-compose.build.yml build lepatch
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d
```

The service listens on port 3000 by default and persists SQLite data in the
`lepatch-sqlite-data` volume. Do not remove volumes or run database commands
against the live app while building or validating changes.

## Security and user data

- Every state-changing API route must use session authentication and CSRF
  validation. Client mutations send the `X-CSRF-Token` value.
- Scope reads and writes to the authenticated user. GitHub write operations
  must verify the linked account and GitHub permissions on the server; UI checks
  alone do not authorize writes.
- Never log tokens, OAuth codes, passwords, cookies, integration secrets, or
  private user content.
- Do not edit live user records or run seed scripts against a live database.
  Do not use Prisma commands. Preserve existing SQLite data and encrypted
  integration settings.
- Validate and bound request bodies, paths, pagination, and external API calls.
  Treat GitHub rate limits and outages as recoverable; preserve cached data.

## Go and UI conventions

- Keep business logic and API behavior in Go. The UI handles presentation and
  interaction; it does not replace server authorization.
- Reuse existing auth, CSRF, store, logger, GitHub client, and queue helpers.
  Avoid new runtime dependencies unless the change requires one.
- Keep release comparison based on GitHub release identity and tag, not
  semver-sorted tags. Preserve scheduler jitter and worker behavior unless the
  task explicitly changes it.
- Use accessible controls, visible keyboard focus, responsive layouts, and the
  existing theme tokens. Check phone and desktop widths when changing UI.
- Add Go runtime tests for API authorization and meaningful tests for core
  behavior. Source-pattern checks do not replace runtime tests.
- Build `ui/` before building the Go binary so `go:embed` includes the current
  frontend. The Docker build performs this automatically.

## Product boundaries

Discovery is limited to repository search and sponsored maintainers. Do not add
a separate repository directory or server-management features. Historical SQL
migrations and changelog history are retained.
