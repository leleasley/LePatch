# Security

Please report security vulnerabilities privately via GitHub's private vulnerability
reporting feature (Security tab) or by emailing the maintainers. Do not open
public issues for unpatched vulnerabilities.

## Supported versions

Only the latest released version receives security updates.

## Hardening notes

- Run the provided `Dockerfile` (containers run as non-root `node`).
- Set strong, unique `SESSION_SECRET` and `ENCRYPTION_KEY` values.
- Keep PostgreSQL/Redis off public networks; only the app port (3000) is needed.
- Configure CSRF and rate limits are enabled by default.