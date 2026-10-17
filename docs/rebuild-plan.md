# LePatch Rebuild Plan

This document scopes the next major iteration of LePatch: from a capable but
visually inconsistent web app into a focused, modern GitHub release tracker that
is ready to be published as an open-source self-hosted project.

## Goals

1. **Product focus** — GitHub release monitoring, classification, changelog
   reading, issue tracking, and Discord/Telegram notification. No server or
   package management.
2. **Modern UX** — calmer, flatter, denser-but-readable interface inspired by
   GitHub's own dark/light chrome; remove glassmorphism, neon glows, and
   oversized hero surfaces from primary workflows.
3. **Open-source readiness** — non-root containers, CI, documented setup,
   LICENSE, security policy, and first-run bootstrap that needs no manual DB
   edits.
4. **Maintainability** — smaller components, single design-token layer, stronger
   test coverage (API + Playwright smoke), and paginated list endpoints.

## Phase A — Ship-hardening (low risk, high value)

- [x] Non-root Docker image (`USER node`).
- [x] Remove retired-agent dependencies from the image (`adb`).
- [x] GitHub Actions CI running `npm run check`.
- [x] MIT license + security/contributing docs.
- [x] Logger compliance in admin clients.
- [x] Dashboard status/release truncation no longer hides items past the 6th.

## Phase B — Design system overhaul (UI)

- [x] Define semantic tokens in `globals.css` (`--color-text`, `--color-accent`,
     `--color-border`, status colors) plus primitives in `src/components/ui/`.
- [x] Flatten default dark/light theme to GitHub-style neutrals; disable glass
     blur and background assets.
- [x] Mobile top bar + burger drawer with grouped vertical navigation.
- [ ] Add `Input` and `Tabs` primitives and migrate form-heavy pages.
- [ ] Remove per-page bespoke Tailwind; move to semantic classes.

## Phase C — Feature consolidation

- [ ] Consolidate notifications: single notification center with per-app mute,
     digest, quiet hours.
- [ ] GitHub App integration (optional): installation flow + webhook delivery
     instead of PAT-only.

## Phase D — Testing & release

- [ ] Playwright smoke tests for login, add app, release list.
- [ ] API pagination/filter tests for releases.
- [ ] Versioned releases via GitHub with changelog.

## Non-goals

- Do not reintroduce server/agent/package management (see AGENTS.md
  "Removed Subsystems").
- Do not replace GitHub release IDs/tags with semver sorting.
