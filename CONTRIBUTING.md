# Contributing to Baindar

Thanks for your interest in contributing. This file is the short version.
[`AGENTS.md`](./AGENTS.md) is the canonical source for repo conventions,
architecture, and recipes — read it before making non-trivial changes.

## Quick start

```sh
bun install
bun run --filter '*/api' dev       # Worker API on :8787
bun run --filter '*/web' dev       # Web client on :5173
```

Configure API secrets by copying `packages/api/.env.example` to
`packages/api/.env` and filling in the values you need.

## Tooling

- **Bun only.** Use `bun`, `bun run`, `bun add`, `bun remove`, `bunx`.
  `npm` / `pnpm` / `yarn` / `npx` are not used in this repo.
- Required formatter/linter/type checker: `oxfmt`, `oxlint`, `tsgo`.

## Required verification

Before opening a PR, run from repo root and make sure all three pass:

```sh
bun run lint
bun run format
bun run ts-check
```

`bun run lint:fix` and `bun run format:fix` are safe to run first.

If you changed routes or schemas in `packages/api`, also regenerate the SDK:

```sh
bun run --filter '*/sdk' build
```

See [`.agents/regenerate-sdk.md`](./.agents/regenerate-sdk.md) for details.

## Pull requests

- All changes go through a PR. Don't commit or push directly to `main`.
- Branch from `main`: `git switch -c <your-handle>/<short-slug>`.
- Keep PRs focused. A bug fix doesn't need a refactor; a refactor doesn't need
  feature work.
- Tests: backend feature logic should have a happy-path and a domain-error-path
  test. Bug fixes should add a test that would have failed before the fix.

## Architecture rules to know

A few of the highest-impact rules from `AGENTS.md`:

- `packages/web`, `packages/mobile`, and `packages/desktop` consume the API
  **only** through `@baindar/sdk`. Don't import from `packages/api/` in a
  client package.
- Storage modules return domain `Entity` types via `toEntity` mappers — not
  raw DB rows. Storage cannot import peer storage namespaces.
- Domain failures use typed `NamedError` variants, scoped inside the feature
  namespace. No global `shared/errors.ts`.
- Schemas in `packages/api` are the source of truth for the public contract.
  Reuse feature schemas in routes; don't redefine.

If a recipe under [`.agents/`](./.agents/) matches what you're doing
(`add-feature.md`, `add-route.md`, `regenerate-sdk.md`, …), read it first.

## Reporting security issues

Please don't open public issues for security vulnerabilities. See
[`SECURITY.md`](./SECURITY.md).
