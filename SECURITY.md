# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report privately:

- Use **GitHub Security Advisories** ("Report a vulnerability" on the Security tab), or
- Email the maintainer: **xnohat@gmail.com**

Please include:

- A description of the issue and its impact.
- Steps to reproduce (a proof-of-concept if possible).
- Affected version / commit.

You can expect an initial acknowledgement within a few days. We'll work with you on a fix
and coordinate disclosure once a patch is available.

## Scope & hardening notes

WebObsidian is **self-hosted and single-user**. Operators are responsible for deploying it
safely. Key points:

- **Change the default password (`123456`)** immediately after first login.
- Master password is scrypt-hashed; the JWT secret is auto-generated.
- API keys are hashed at rest and scoped (`read` / `write` / `search`) with per-key rate
  limiting.
- File paths are guarded against traversal; the vault picker is confined to `ALLOWED_ROOTS`.
- Secrets (git token, API keys) live in `data/settings.json` on the server — mount `/data`
  as a private volume and keep it out of version control.
- Run behind a TLS-terminating reverse proxy (set `HTTP_BIND=127.0.0.1`) for any
  internet-facing deployment. When you do, set `TRUST_PROXY` to match your proxy
  topology (e.g. `true` or a subnet list) so `X-Forwarded-Proto` is honoured.
  Leave `TRUST_PROXY=false` (default) for directly-exposed instances — the login
  rate limit is keyed on the real TCP socket address regardless, so it cannot be
  bypassed by rotating `X-Forwarded-For`.

## Supported versions

This project is pre-1.0; security fixes are applied to the latest `main`. Please run a
recent build.
