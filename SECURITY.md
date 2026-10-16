# Security

## Reporting a vulnerability

Report suspected vulnerabilities through GitHub's private vulnerability
reporting on this repository (Security → Report a vulnerability). If that is not
available, open a minimal issue asking for a private contact channel and share
no details publicly.

Please include: affected version or commit, reproduction steps, impact, and any
suggested fix. We aim to acknowledge reports within a few days.

## Supported versions

Only the latest release receives security fixes.

## Deployment hardening

LePatch self-hosts with access to GitHub tokens, notification secrets and a
database of your watched repositories. Treat the deployment as sensitive.

- **Serve over HTTPS.** The `__Host-` session cookie is only sent over TLS. On
  plain HTTP the app falls back to an unprefixed, non-Secure cookie; expose the
  app only on a private network in that case.
- **Set `TRUST_PROXY=true` only when a proxy you control sits in front of the
  app.** When it is unset, forwarded-IP headers are ignored and every request
  shares one rate-limit bucket — safe, but coarse.
- Generate strong, unique values for `SESSION_SECRET` and `ENCRYPTION_KEY`.
  Rotating `ENCRYPTION_KEY` requires re-entering every stored secret.
- Keep PostgreSQL and Redis off public networks. Only the app port is needed.
- Give the app a GitHub token with the narrowest scope that works. Fine-grained
  tokens scoped to the repositories you watch are preferred over classic `repo`.
- Set `APP_URL` to the exact public URL. It anchors WebAuthn relying-party
  validation and OAuth redirects; a mismatch breaks passkeys.
- Backups contain password hashes, MFA seeds and encrypted tokens. Store them
  encrypted at rest and restrict access.

## Security-relevant behaviour

- CSRF: double-submit cookie with a constant-time comparison, enforced on every
  mutating route except documented webhook/setup endpoints.
- Sessions: server-side rows with absolute expiry; password resets and
  user-initiated changes revoke sessions and trusted devices.
- Secrets: notification and integration secrets are encrypted with AES-256-GCM
  at rest; the API returns key names, never values.
- Rate limits: Redis-backed when available, per-process otherwise, keyed on the
  client IP only when `TRUST_PROXY` is set.
- Rendering: GitHub content is sanitised before rendering; Telegram messages are
  HTML-escaped before being interpolated.
