# Contributing

Thanks for taking the time to contribute. This project is a self-hosted GitHub
release tracker; the conventions below keep it reviewable and safe to operate.

## Getting set up

```bash
npm ci
cp .env.example .env
docker compose up -d postgres redis
npx prisma generate
npx prisma migrate deploy
npm run dev
npm run worker   # second terminal
```

## Before you open a pull request

```bash
npm run check    # lint → typecheck → tests → production build
```

## Ground rules

- **Databases**: schema changes need a migration under `prisma/migrations/`.
  `prisma migrate dev` is for local work only. Never run `prisma db push` or
  `prisma migrate dev` against a real database, and never write to `User`,
  `Session`, `PasskeyCredential` or `TelegramLink` rows by hand.
- **CSRF**: every mutating route validates CSRF (`validateCsrf`) except the
  documented setup/webhook endpoints. Client mutations use `csrfFetch`.
- **Auth**: state the required role explicitly in each route handler
  (`requireAdmin`, `requireModerator`, `assertApiSession`, `assertCanManageApps`)
  and scope queries by `userId`.
- **Audit**: administrative mutations call `createAuditLog`. Add new action
  names to `src/lib/audit-actions.ts` only — that file is the single source of
  truth.
- **Logging**: use `@/lib/logger`, never `console.log`. Never log tokens, chat
  IDs, message bodies, or anything a user typed into a secret field.
- **Secrets**: read them through `@/lib/integration-secrets` so they stay
  encrypted at rest.
- **UI**: use the tokens and primitives in `src/components/ui` rather than
  hardcoded colour classes. Both themes must be legible, focus states visible,
  and interactive elements keyboard reachable. See
  [`docs/design-system.md`](docs/design-system.md).
- **Dependencies**: justify new runtime dependencies in the pull request. Prefer
  removing a dependency over adding one.

## Tests

- Pure logic (parsers, classifiers, pagination, time maths) must have unit tests.
- `tests/route-security.test.ts` enforces CSRF, auth and audit coverage across
  every mutating route. If you add a route, make it pass rather than adding an
  exemption.
- Keep tests deterministic: no network, no database, no reliance on the current
  time.

## Commit messages

Conventional-commit style prefixes (`feat:`, `fix:`, `refactor:`, `docs:`,
`chore:`, `test:`, `security:`) with an imperative summary. Explain *why* in the
body when the change is not obvious.

## Release process

Maintainers tag `vX.Y.Z`, which triggers the release workflow: it runs the full
check, builds and pushes the image to GHCR, and publishes a GitHub release using
the matching `CHANGELOG.md` entry. Add your change to the `Unreleased` section
of the changelog in the same pull request.
