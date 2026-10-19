# Contributing

LePatch is a Go service with a Vite-built web UI embedded in the binary. Keep
changes focused on GitHub release monitoring, repository activity, discovery,
notifications, and account administration.

## Local setup

```sh
cp .env.example .env
npm ci --prefix ui
```

Set the required secrets in `.env`, then run the Go app:

```sh
npm run build --prefix ui
go run ./cmd/lepatch
```

## Before opening a pull request

```sh
gofmt -w <changed-go-files>
go test ./...
go vet ./...
npm run build --prefix ui
git diff --check
```

The production Docker build compiles the UI and embeds it in the Go service.

## Ground rules

- Keep authorization, user scoping, CSRF validation, and GitHub permission
  checks in Go route handlers. Every state-changing route requires CSRF.
- Never write directly to a live database. Preserve historical SQL migrations
  under `prisma/migrations/`; do not use Prisma commands.
- Use the existing auth, store, logger, GitHub client, and queue helpers. Never
  log credentials, tokens, cookies, or private user content.
- Add runtime tests for authorization and API behavior. Keep tests deterministic
  and independent of the public GitHub API.
- Keep release identity based on GitHub release IDs and tag names. Do not sort
  releases by semver.
- Do not restore retired server-management subsystems.
- Keep the phone layout usable, preserve keyboard access and visible focus, and
  check both themes when changing UI. Explain any new runtime dependency in the
  pull request.

## Release process

Pushing a `vX.Y.Z` tag runs Go/UI checks, builds binaries, publishes a GitHub
release, and builds the container image. Keep `CHANGELOG.md` current for
user-visible releases.
