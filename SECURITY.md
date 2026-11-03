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
- `webo install` does not create a fixed recovery password. Legacy
  `WEBOBSIDIAN_PASSWORD=123456` is treated as an absent recovery override: a fresh
  installation requires a password change, and an existing chosen password stays
  authoritative. Use a distinct strong value for intentional recovery access.
- Master password is scrypt-hashed; the JWT secret is auto-generated.
- API keys are hashed at rest and scoped (`read` / `write` / `search`) with per-key rate
  limiting.
- File paths are guarded against traversal; the vault picker is confined to `ALLOWED_ROOTS`.
- Recursive copies check every resolved entry against the permitted roots before
  publishing a complete copy. Vault mutations and version checks are serialized
  within one server process. Independent filesystem writers and malicious concurrent
  replacement of symlinks are outside this transaction guarantee.
- Secrets (git token, API keys) live in `data/settings.json` on the server — mount `/data`
  as a private volume and keep it out of version control.
- Run behind a TLS-terminating reverse proxy (set `HTTP_BIND=127.0.0.1`) for any
  internet-facing deployment. `TRUST_PROXY` defaults to `true` so `X-Forwarded-Proto`
  is honoured (Secure cookies work) behind that proxy; tighten it to a subnet list
  if you want, or set `TRUST_PROXY=false` for an instance exposed directly to clients
  with no proxy. Either way the login rate limit is keyed on the real TCP socket
  address, so it cannot be bypassed by rotating `X-Forwarded-For`.

## Supported versions

This project is pre-1.0; security fixes are applied to the latest `main`. Please run a
recent build.

## Remote MCP

Optional `/mcp` uses existing scoped API keys on every request, independently of browser sessions. REST and MCP share per-key limits. Host/Origin validation uses explicit configuration, not forwarded authority. TLS terminates at the proxy. Never log Authorization, keys or note bodies; do not install a shared privileged service key for remote users. See [remote deployment](docs/MCP_REMOTE.md).
