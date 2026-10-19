# PostgreSQL to SQLite import

LePatch runs as a single Go service and stores application data in SQLite. The
one-time importer can copy an existing PostgreSQL installation into a new
SQLite database. It reads the PostgreSQL source in a read-only transaction and
refuses to overwrite an existing target.

## Before importing

1. Stop the old web and worker services so they cannot change data during the
   copy or send duplicate notifications.
2. Take a PostgreSQL backup and verify that it can be read.
3. Keep the source PostgreSQL and Redis volumes unchanged until the new service
   has passed the checks below.
4. Choose a new SQLite path. Do not use an existing application database.

The importer copies application rows, including users, sessions, linked GitHub
accounts, watched repositories, releases, issues, notifications, settings, and
audit history. Historical PostgreSQL migrations under `prisma/migrations/` are
kept as project history; they are not run by the Go service. Removed legacy
data is not recreated.

## Run the importer

Run this from the repository root. Keep the connection string out of shell
history and logs where possible.

```sh
export SOURCE_DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require'
export TARGET_DATABASE_PATH="$PWD/data/lepatch-import.sqlite"
go run ./cmd/lepatch-import
```

The importer prints row counts by table. Review the output and verify that the
file exists before installing it. Do not check in the imported database or the
source connection string.

## Start from the imported database

For a new installation, Docker Compose creates an empty persistent volume. To
use an imported database, copy it into a new, empty volume before starting the
service:

```sh
docker compose -f docker-compose.yml build lepatch
docker volume create lepatch-sqlite-data
docker run --rm --user 0 --entrypoint sh \
  -v "$PWD/data/lepatch-import.sqlite:/source.sqlite:ro" \
  -v lepatch-sqlite-data:/app/data \
  lepatch-app:latest \
  -c 'cp /source.sqlite /app/data/lepatch.sqlite && chown lepatch:lepatch /app/data/lepatch.sqlite'
docker compose -f docker-compose.yml up -d
```

Only copy into a new, empty volume. Never run the copy command over an existing
SQLite database. Keep the same `SESSION_SECRET` and `ENCRYPTION_KEY` used by the
previous installation so sessions and encrypted integration values remain
usable.

## Verify and roll back

Check `/api/health`, sign in, and verify watched repositories, release history,
issue tracking, notification settings, GitHub linking, and audit history. Send
a test notification and confirm that a database backup can be created and
restored before retiring the source services.

To roll back, stop the Go service and restart the previous deployment against
its original PostgreSQL and Redis volumes. Never point the previous deployment
at the SQLite file. Keep the imported file and source backup until acceptance
is complete.
