# Security Policy

## Reporting a vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Use GitHub's [private vulnerability reporting](https://github.com/saribmah/baindar/security/advisories/new)
to send a report. Include:

- A description of the issue and its impact.
- Steps to reproduce (a minimal proof-of-concept is ideal).
- The affected package(s): `packages/api`, `packages/sdk`, `packages/web`,
  `packages/mobile`, or `packages/desktop`.
- Any suggested mitigation.

You should expect an initial acknowledgement within a few business days. Fixes
will be prioritized based on severity and exploitability.

## Scope

In scope:

- The Cloudflare Worker API (`packages/api/`) and its persistence layers.
- The TypeScript SDK published as `@baindar/sdk`.
- The web (`packages/web/`), mobile (`packages/mobile/`), and desktop
  (`packages/desktop/`) clients.
- Auth flows (Better Auth, Google/Apple OAuth, OTP email).
- Document ingestion, storage, and retrieval paths.

Out of scope:

- Issues that require local code modification or physical device access.
- Denial-of-service attacks against shared infrastructure.
- Findings from automated scanners without a working proof-of-concept.
- Third-party dependencies — please report those upstream.

## Supported versions

Only the `main` branch and the latest published SDK / desktop release are
supported. Older releases will not receive backported fixes.
