<!--
  Thanks for contributing. Keep PRs small and focused where you can.
-->

## What changed

<!-- A short summary of the change and why it is needed. -->

## Type

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor
- [ ] Documentation
- [ ] Dependency or tooling

## Checklist

- [ ] `npm run check` passes (lint, typecheck, tests, build)
- [ ] Database changes use a real migration under `prisma/migrations/`
      (never `prisma db push` or `prisma migrate dev` against a real database)
- [ ] Mutating API routes validate CSRF and log admin actions via `createAuditLog`
- [ ] New UI follows the tokens in `src/app/globals.css` rather than hardcoded
      colour classes
- [ ] Screenshots attached for UI changes (light and dark where relevant)

## Notes for reviewers

<!-- Anything subtle, risky, or deliberately out of scope. -->
