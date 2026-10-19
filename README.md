# LePatch

LePatch is a self-hosted GitHub release monitor. Watch repositories, review
release history and repository activity, track issues, and receive Discord or
Telegram notifications. Search and sponsored maintainers help you discover
repositories.

The Go service serves an embedded, mobile-friendly web app. It supports GitHub
OAuth linking, password and passkey sign-in, MFA, user roles, audit history,
backups, live updates, and an installable PWA. Your own GitHub repositories
include an in-app browser for README, releases, files, commits, pull requests,
issues, branches, and Actions. File commits are checked against the linked
GitHub account and its repository permissions.

## Run with Docker Compose

The published image is hosted at `ghcr.io/leleasley/lepatch`. Clone the repo
for the Compose file and configuration template:

```sh
git clone https://github.com/leleasley/LePatch.git
cd LePatch
cp .env.example .env
```

Edit `.env` before starting. Set `APP_URL` to the address you use to open the
app, and replace the example `SESSION_SECRET` and `ENCRYPTION_KEY` values with
fresh output from `openssl rand -base64 48` and `openssl rand -base64 32`.
Keep these keys stable across upgrades or migrations. `LEPATCH_VERSION` defaults
to `latest`; set it to a release tag such as `v0.1.0` to pin an installation.

```sh
docker compose pull
docker compose up -d
```

The app is available on port 3000 by default. `LEPATCH_PORT` changes the host
port. SQLite and backups are stored in the persistent `lepatch-sqlite-data`
volume. On a new database, open the app and create the first administrator.

GHCR images are published when a `vX.Y.Z` release tag is pushed. No image is
available until the first release. If the package is private, make it public in
GitHub Packages settings for anonymous pulls, or sign in to GHCR before running
`docker compose pull`.

To run the current checkout before a GHCR image exists, build from source with
the local override:

```sh
docker compose -f docker-compose.yml -f docker-compose.build.yml build lepatch
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d
```

The **About LePatch** page checks GitHub for published updates. It links to the
release and shows the Docker pull/restart command; updates are installed when
you choose to rebuild or pull the image. It never replaces the app or database
by itself.

## Import an existing installation

The one-time importer copies an existing PostgreSQL database into a new SQLite
file. It does not modify the source database or overwrite an existing target.
Read [MIGRATION.md](MIGRATION.md) before importing; it covers the table mapping,
backup checks, configuration, and rollback procedure.

```sh
export SOURCE_DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require'
export TARGET_DATABASE_PATH='./data/lepatch-import.sqlite'
go run ./cmd/lepatch-import
```

Do not put a database URL or credentials in a checked-in file. Do not copy an
import over an existing SQLite database or volume.

## Configuration

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public origin used for OAuth redirects and secure cookies. |
| `SESSION_SECRET` | Signs sessions and OAuth state. Keep it stable. |
| `ENCRYPTION_KEY` | Decrypts integration secrets. Keep it stable. |
| `GITHUB_TOKEN` | Optional shared token for public GitHub checks. |
| `TRUST_PROXY` | Enable only behind a trusted reverse proxy. |
| `PORT` | Container listen port; defaults to `3000`. |
| `DATA_DIR` | Persistent application data directory. |
| `DATABASE_PATH` | SQLite file path; defaults inside `DATA_DIR`. |
| `LEPATCH_PORT` | Host port published by Docker Compose. |
| `SOURCE_DATABASE_URL` | One-time PostgreSQL importer source. |
| `TARGET_DATABASE_PATH` | One-time importer destination; must not exist. |

GitHub OAuth client settings are configured in the app's integration settings.
The OAuth callback is `/api/auth/github/callback`.

Telegram release notifications are sent through a Telegram bot token and
linked chat accounts. Telegram webhooks are only for receiving bot commands
such as `/link`; configure a public HTTPS `APP_URL`, save a webhook secret in
admin settings, and choose **Register bot webhook**. A Telegram webhook does
not send outbound notifications.

## Development

```sh
npm ci --prefix ui
npm run build --prefix ui
go test ./...
go vet ./...
set -a; . ./.env; set +a
go run ./cmd/lepatch
```

The frontend build writes to `internal/web/dist`, which the Go server embeds.
The Docker build runs the frontend build automatically. See
[CONTRIBUTING.md](CONTRIBUTING.md) for review and test expectations.

To prepare a versioned local build, run `scripts/set-version.sh X.Y.Z` and
then build with both Compose files shown above. A `vX.Y.Z` tag publishes
binaries, a GitHub release, and a GHCR image through GitHub Actions. Do not push
a version tag until the release is ready; pushing `main` alone does not publish
one.

## License

MIT. See [LICENSE](LICENSE).
