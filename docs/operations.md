# Operations

## Deploy with Docker Compose

```sh
docker compose -f docker-compose.yml build lepatch
docker compose -f docker-compose.yml up -d
docker compose -f docker-compose.yml ps
```

Check `http://127.0.0.1:3000/api/health` locally. Change the host port with
`LEPATCH_PORT`. The service stores its SQLite database and backups in the
`lepatch-sqlite-data` volume.

## Logs and restart

```sh
docker compose -f docker-compose.yml logs --tail=100 lepatch
docker compose -f docker-compose.yml restart lepatch
```

## Backups and upgrades

Use the in-app backup tools or stop the service and make a consistent copy of
the SQLite database and backup directory. Keep the existing `SESSION_SECRET`
and `ENCRYPTION_KEY` across upgrades. Before an upgrade, keep a restorable copy
of the database. After upgrading, verify `/api/health`, sign in, and confirm the
release feed and integrations.

For a one-time PostgreSQL-to-SQLite import, follow [MIGRATION.md](../MIGRATION.md).
Do not run Prisma migrations or database mutation commands against the live
SQLite database.
