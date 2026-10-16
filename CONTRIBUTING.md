# Contributing

1. Fork and create a feature branch.
2. Install dependencies: `npm ci`
3. Validate locally: `npm run check`
4. Database changes require a real Prisma migration (`prisma migrate dev` only in
   dev; never `prisma db push`).
5. Follow `AGENTS.md` conventions: `csrfFetch`/`validateCsrf`, project logger,
   audit logging for admin mutations.
6. Open a pull request describing changes, tests, and screenshots for UI work.