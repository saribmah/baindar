# AGENTS.md

> Canonical agent policy file for this repo. Read top-to-bottom on first run,
> consult per-section thereafter. `CLAUDE.md` is a symlink to this file.

## Canonical Instruction Source

- `AGENTS.md` is the single canonical agent policy file for this repository.
- `CLAUDE.md` is a symlink to `AGENTS.md`.
- Do not maintain a second divergent copy of agent policy.

## About this project

Baindar is a personal document binder powered by AI. Drop in any PDF,
receipt, invoice, statement, contract, manual, screenshot, or book —
Baindar extracts structured data, organizes it, and makes it queryable in
plain English. It's not a PDF chat app; it's long-term, AI-ready memory for
your documents.

**What it does**:

- Ingest mixed document types (PDFs, images, receipts, contracts, manuals, books)
- Extract structured data and metadata from each document
- Organize documents into a searchable, browsable binder
- Answer natural-language questions across the full corpus ("find my Apple receipt", "what does the lease say about pets")
- Summarize long documents and chapters on demand

**For**: individuals and small teams managing personal and professional
document collections.

See [`.agents/PROJECT.md`](./.agents/PROJECT.md) for the full project identity
(name, scope, current focus, notes).

## Stack overview

A Bun monorepo on Cloudflare Workers with:

- **`packages/api/`** — Hono + hono-openapi backend. OpenAPI spec generated
  from route definitions. Uses an `AsyncLocalStorage`-based per-request
  `Instance` for `env` and `auth` injection.
- **`packages/sdk/`** — TypeScript SDK auto-generated from the API OpenAPI
  spec via `@hey-api/openapi-ts`. Publishable to npm.
- **`packages/web/`** — React 19 + Vite + TailwindCSS v4 frontend. Consumes
  the API exclusively through `@baindar/sdk`. Served as static assets by
  the same Worker in production.

Tooling: `oxlint` + `oxfmt` + `tsgo` + `husky` + `lint-staged`.

## Agent-friendly recipes

When asked to do specific kinds of work, read the matching recipe first:

- [`.agents/add-feature.md`](./.agents/add-feature.md) — add a domain feature module
- [`.agents/add-route.md`](./.agents/add-route.md) — add a route to an existing feature
- [`.agents/add-format.md`](./.agents/add-format.md) — re-add a document format (PDF, image, text, …)
- [`.agents/regenerate-sdk.md`](./.agents/regenerate-sdk.md) — refresh the SDK after API changes
- [`.agents/add-storage-prisma.md`](./.agents/add-storage-prisma.md) — wire Prisma + Postgres
- [`.agents/add-storage-d1.md`](./.agents/add-storage-d1.md) — wire Cloudflare D1
- [`.agents/add-auth-provider.md`](./.agents/add-auth-provider.md) — add SIWE/Privy/OAuth
- [`.agents/PROJECT.md`](./.agents/PROJECT.md) — project-level context (read for orientation)
- [`.agents/ai-layer-prd.md`](./.agents/ai-layer-prd.md) — clean-slate DO-native AI/binder architecture direction

## Tooling Rules

- Use **Bun only**. Allowed: `bun`, `bun run`, `bun add`, `bun remove`, `bunx`.
- Do not use `npm`, `pnpm`, `yarn`, or `npx`.

## Architecture (hard rules)

### Package responsibilities

- `packages/api/` is the backend service and domain core. It owns business
  capabilities and transport adapters, but not frontend concerns.
- `packages/sdk/` is the public integration contract, generated from the API
  OpenAPI spec. External consumers (and `packages/web/`) integrate through
  this package. Never edit `packages/sdk/src/v1/gen/*` by hand.
- `packages/web/` is a first-party UI client. It consumes
  `@baindar/sdk` and MUST NOT import backend internals from
  `packages/api/`.

### Backend layering (`packages/api`)

- HTTP/app transport wiring: `src/app/*`, `src/server/server.ts`, `src/server/routes/*`.
- Cross-cutting middleware: `src/middleware/*`.
- Domain features: `src/<feature>/*` (one directory per business capability).
- Persistence and DB mapping: feature-local storage modules
  (`src/<feature>/storage.ts`).
- Dependency direction is one-way: `server/routes → feature → storage`.
- Do not introduce reverse dependencies (storage importing routes, routes
  importing storage from unrelated features).
- Storage modules MAY use joins/nested selects across related tables to build
  their own typed result. Reading across tables at the query level is allowed.
- Storage modules MUST NOT import or call peer storage namespaces directly.
  Express cross-table reads in the query itself.
- Direct `Instance.env` / `Instance.db` access is allowed only inside
  `src/config/` and `src/<feature>/storage.ts` respectively. Routes and
  feature modules go through `Config.*` accessors / their own storage module.
- Only storage modules may perform persistence operations and DB transactions.
- Storage modules contain only persistence: queries, inserts, updates,
  deletes, row→entity mapping, transactions. Business logic — validation,
  authorization, cross-entity orchestration — belongs in feature modules.

### Entity & storage pattern

- Every domain feature module defines a `<Module>.Entity` zod schema (the
  canonical domain shape). Storage returns `Entity` (or `Entity | null`).
- Every storage module defines:
  - `entitySelect` — the columns/select shape it reads
  - `EntityRow` — the raw DB row type
  - `toEntity(row): <Module>.Entity` — the row→domain mapper
  - Query functions that call `toEntity` internally and return `Entity` types,
    not raw `EntityRow`.

### Route–feature boundary

- Feature modules MUST remain transport-agnostic. They MUST NOT depend on
  routes, request params, query strings, headers, or HTTP context.
- Route handlers parse + validate + authorize + map errors. They convert HTTP
  payloads to feature-domain inputs and feature outputs to HTTP responses.
- Do not pass HTTP/DTO types into feature functions.
- Do not return HTTP/DTO types from feature functions.

### Error handling

- Domain failures use typed `NamedError` variants. Each error condition gets
  its own class — no single error with a `code` enum discriminant.
- Errors live INSIDE the feature namespace, not in a separate `errors.ts`.
- Each error has both `const` and `type` exports with the same name:
  ```ts
  export const NotFoundError = NamedError.create("NotFoundError", z.object({
    id: z.string(),
    message: z.string().optional(),
  }));
  export type NotFoundError = InstanceType<typeof NotFoundError>;
  ```
- Error names must be globally unique (used by `isInstance` matching). Prefix
  with the domain when names would collide (e.g. `NoteNotFoundError`).
- Errors belong to the feature that owns them. Do not introduce a
  `src/shared/` (or similar global) errors module — if two features need to
  raise the same condition, define the error in the feature that conceptually
  owns it and import from there. Shared error dumps are an anti-pattern that
  hide ownership and grow into kitchen sinks.
- Route handlers map errors via `createErrorMapper`:
  ```ts
  const mapError = createErrorMapper([
    { error: Note.NotFoundError, status: 404 },
    { error: Note.NotOwnedError, status: 403 },
  ]);
  ```
- Infrastructure/config errors (missing keys, RPC URLs) map to **500**, not
  4xx. Check config errors before domain errors in catch chains.

### Schema discipline (drives generated OpenAPI + SDK)

- Backend schemas are the source of truth for the public contract.
- Reuse feature/domain schemas in routes — don't redefine duplicate route-local
  enums/contracts.
- Author schemas with downstream codegen in mind: optional / nullable / default
  semantics affect generated SDK types.
- Avoid unsafe assertions (`as unknown as`, `as any`). Fix the schema instead.
- For reusable OpenAPI components, add `meta({ ref: "ComponentName" })`.
- `operationId` becomes the SDK method name. Use `<feature>.<verb>` form
  (e.g. `note.list`, `note.create`, `note.update`).

### SDK policy

- The SDK contract is breaking-change-allowed during initial development —
  bump versions before publishing as the API stabilizes.
- Every API contract change in `packages/api` MUST regenerate SDK artifacts in
  the same change: `bun run --filter '*/sdk' build`.
- Update SDK consumers (`packages/web`, downstream apps) in the same change
  when generated types/contracts shift.
- Never manually edit `packages/sdk/src/v1/gen/*` or `packages/sdk/lib/*`.
- `packages/web/`, `packages/mobile/`, and `packages/desktop/` consume the API
  exclusively via `@baindar/sdk`. Do not import directly from `packages/api/`
  or hand-roll API clients.
- See [`.agents/regenerate-sdk.md`](./.agents/regenerate-sdk.md) for the
  regeneration recipe.

### Web feature organization (`packages/web`)

- Organize frontend product code under `packages/web/src/features/<feature>/`.
- App-level wiring may live at `packages/web/src/App.tsx`; shared SDK provider
  code may live under `packages/web/src/sdk/`; global styles stay in
  `packages/web/src/styles.css`.
- Do not recreate top-level product folders such as `src/auth`, `src/library`,
  `src/dashboard`, or `src/reader`. New product UI belongs in `src/features/*`.
- Keep feature directories small and responsibility-specific. Prefer
  subfolders such as `components/`, `hooks/`, `pages/`, `utils/`, `guards/`,
  and `api/` when a feature needs them.
- Each feature should export its public surface from `src/features/<feature>/index.ts`.
  Cross-feature imports should go through that public surface unless importing
  a tightly scoped internal file is clearly better.
- Feature pages compose hooks/components; they should not grow into large
  all-in-one files. Extract reusable cards, dialogs, menus, empty states,
  and data hooks before a page becomes hard to scan.
- `dashboard` is the current signed-in home surface. The historical
  `library/Library.tsx` naming was wrong; do not bring it back.
- There is currently no `library` feature. Create `src/features/library/` only
  when implementing a real library capability distinct from dashboard.
- The canonical signed-in route is `/dashboard`. Keep `/library` only as a
  compatibility redirect unless the real library feature is introduced.
- `profile` owns signed-in user/profile UI affordances, including profile menu
  and display-name helpers. Dashboard should consume these from `profile`
  instead of owning profile logic directly.
- `auth` owns Better Auth client setup, auth pages, auth guards, and auth-only
  UI components.

### Mobile feature organization (`packages/mobile`)

- Organize Expo/React Native product code under
  `packages/mobile/src/features/<feature>/`.
- Expo Router files under `packages/mobile/app/` should stay thin. They route
  to feature screens, configure redirects, or provide app shell wiring only.
- Do not recreate top-level product folders such as `src/auth`, `src/library`,
  `src/dashboard`, `src/landing`, or `src/reader`. New product UI belongs in
  `src/features/*`.
- Keep feature directories small and responsibility-specific. Prefer
  subfolders such as `components/`, `hooks/`, `pages/`, `utils/`, and
  feature-local `*.styles.ts` files when a feature needs shared native styles.
- Each feature should export its public surface from `src/features/<feature>/index.ts`.
  Route files and cross-feature imports should go through that public surface.
- Feature pages compose hooks/components; they should not own large all-in-one
  implementations. Extract reusable cards, dialogs, bottom tabs, empty states,
  native style objects, and data hooks before a screen becomes hard to scan.
- `dashboard` is the current signed-in home surface on mobile. The historical
  `app/library.tsx` naming was wrong; do not put dashboard implementation
  there.
- There is currently no mobile `library` feature. Create
  `src/features/library/` only when implementing a real library capability
  distinct from dashboard.
- The canonical signed-in mobile route is `/dashboard`. Keep `/library` only
  as a compatibility redirect unless the real library feature is introduced.
- `profile` owns signed-in user/profile helpers and sign-out affordances.
  Dashboard should consume these from `profile` instead of owning profile
  logic directly.
- `auth` owns Better Auth client setup, auth screens, auth gates, and auth-only
  UI components.

### Desktop feature organization (`packages/desktop`)

- Organize Electrobun mainview product code under
  `packages/desktop/src/views/mainview/features/<feature>/`.
- Mainview app wiring may live at `src/views/mainview/App.tsx`; shared SDK
  provider code may live under `src/views/mainview/sdk/`; global styles stay
  in `src/views/mainview/styles.css`.
- Do not recreate top-level mainview product folders such as `auth`, `library`,
  `dashboard`, `landing`, or `reader`. New product UI belongs in
  `src/views/mainview/features/*`.
- Keep feature directories small and responsibility-specific. Prefer
  subfolders such as `components/`, `hooks/`, `pages/`, `utils/`, `guards/`,
  and `api/` when a feature needs them.
- Each feature should export its public surface from
  `src/views/mainview/features/<feature>/index.ts`. App routes and
  cross-feature imports should go through that public surface.
- Feature pages compose hooks/components; they should not grow into large
  all-in-one files. Extract reusable cards, dialogs, menus, empty states,
  and data hooks before a page becomes hard to scan.
- `dashboard` is the current signed-in desktop home surface. The historical
  `library/Library.tsx` naming was wrong; do not bring it back.
- There is currently no desktop `library` feature. Create
  `src/views/mainview/features/library/` only when implementing a real library
  capability distinct from dashboard.
- The canonical signed-in desktop route is `/dashboard`. Keep `/library` only
  as a compatibility redirect unless the real library feature is introduced.
- `profile` owns signed-in user/profile UI affordances, including profile menu
  and display-name helpers. Dashboard should consume these from `profile`
  instead of owning profile logic directly.
- `auth` owns Better Auth client setup, auth pages, auth guards, auth-only UI
  components, and desktop's in-memory bearer-token bridge used by the SDK
  provider.

## Workspace commands

From repo root:

- `bun run build` — build all packages
- `bun run lint` / `bun run lint:fix`
- `bun run format` / `bun run format:fix`
- `bun run ts-check`
- `bun run test`

API only:

- `bun run --filter '*/api' dev`
- `bun run --filter '*/api' deploy`
- `bun run --filter '*/api' cf-typegen`
- `bun run --filter '*/api' openapi:generate`

SDK only:

- `bun run --filter '*/sdk' build` — regenerate from API OpenAPI spec
- `bun run --filter '*/sdk' compile` — build for npm publishing
- `bun run --filter '*/sdk' prepare-publish` — rewrite package.json for publish

Web only:

- `bun run --filter '*/web' dev`
- `bun run --filter '*/web' build`

Mobile only:

- `bun run --filter '*/mobile' start`
- `bun run --filter '*/mobile' ios`
- `bun run --filter '*/mobile' lint`
- `bun run --filter '*/mobile' format`
- `bun run --filter '*/mobile' ts-check`

Desktop only:

- `bun run --filter '*/desktop' dev`
- `bun run --filter '*/desktop' build:view`
- `bun run --filter '*/desktop' lint`
- `bun run --filter '*/desktop' format`
- `bun run --filter '*/desktop' ts-check`

## Required verification

After every code change, run from repo root:

- `bun run lint`
- `bun run format`
- `bun run ts-check`

You may run `bun run lint:fix` and `bun run format:fix` first. If a check
fails, fix the underlying issue and re-run all three until clean.

If you changed routes or schemas, also:

- `bun run --filter '*/sdk' build` — regenerates the OpenAPI spec AND the SDK,
  then re-runs SDK lint/format/ts-check. Update SDK consumers in the same
  change. See [`.agents/regenerate-sdk.md`](./.agents/regenerate-sdk.md).

## Code style

- TypeScript strict mode is required.
- Avoid `any`; use explicit types.
- Modules are ESM (`"type": "module"`).
- Default to no comments. Add a comment only when the WHY is non-obvious.

## Import conventions

Order:
1. Framework/runtime imports (`hono`, `hono/*`, `react`)
2. External dependencies
3. Internal absolute aliases (if introduced)
4. Relative imports (`./`, `../`)

Side-effect imports grouped at the top. Prefer `import type` for type-only
imports. Remove unused imports.

## Version control

- **NEVER commit or push directly to `main`.** All changes go on a feature
  branch + PR, including one-line fixes, doc tweaks, and "obviously safe"
  patches. There are no exceptions for urgency, small diffs, or being
  locally green — main is the deployed branch and bypassing review can
  ship a broken build to production users.
- Before any `git commit` or `git push`, verify the current branch with
  `git branch --show-current`. If it's `main`, stop and create a feature
  branch first (`git switch -c sarib/<short-slug>`).
- Treat a prior PR approval as scoped to that PR only. A merged PR does
  not authorize follow-up commits on main, even for the same logical fix.
- Never use `git push --force` or `git push --force-with-lease` against
  `main` under any circumstance.
- When in doubt, open a PR. The cost of a 30-second review round-trip is
  trivial; the cost of an unreviewed push to main is potentially a
  production outage.

## Secrets

- Local development secrets live in `.env` in the service directory.
- Do not put development secrets into `wrangler.jsonc → vars`.
- Limit direct env reads to `src/config/`. Feature/route modules consume
  typed `Config.*` accessors.

## Testing policy

- New backend feature logic should have at least one happy-path test and one
  domain-error-path test (`bun test`, files under `src/<feature>/__tests__/`).
- New or changed route behavior should have at least one contract-level test
  validating request parsing and response/error mapping.
- Bug fixes should add or update a test that would have failed before the fix.

## Utils

- Shared utilities live in `src/utils/*`.
- Use responsibility-specific files (`context.ts`, `log.ts`, `error.ts`,
  `crypto.ts`).
- Do not create a catch-all `utils.ts`.
- Keep feature-specific helpers inside the feature namespace. Move them to
  `src/utils/*` only when intentionally shared.

## Feature namespacing

- Organize backend code by feature namespace (`document`, `note`, `shelf`, ...).
- Each feature is self-contained under its own directory.
- No global cross-feature folders for feature logic.
- Feature-local helpers stay inside the namespace (non-exported by default).

## Types

- Keep types encapsulated within each feature namespace.
- No shared top-level `types` file for feature-specific types.
- Export types from a feature namespace only when other modules need them.
