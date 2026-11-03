# DashDB

## This is the PUBLIC repo

This is the PUBLIC repo. Never add server, billing, auth, collaboration or enterprise code here.
Paid features plug in only through packages/edition interfaces.

- DashDB Community is AGPL-3.0. Paid cloud, Team and Enterprise features live in the private
  `dashdatabase/dashdb-cloud` repository, which consumes this one as a git submodule.
- Never import `@dashdb-cloud/*` or a relative path that leaves this repository. ESLint enforces
  both (`no-restricted-imports` and `dashdb/no-outside-repo-imports` in
  `packages/config/eslint/base.js`); don't disable them.
- What moved out, and why, is in `docs/moved-to-cloud.md`.

## Layout

pnpm + Turborepo, TypeScript strict, Node 22 (`.nvmrc`).

- `apps/web`: Next.js App Router: the editor (`src/editor`), marketing site, docs, blog, tools.
  Its Next.js version may differ from what you know: read `node_modules/next/dist/docs/` before
  using an API (see `apps/web/AGENTS.md`).
- `packages/core`: the engine (IR, parsers, serializers, diff, migrations, safety rules).
- `packages/edition`: the edition (`oss` / `cloud`) and the interfaces paid builds implement.
- `packages/shared`: zod schemas and types with no Node or React dependencies.
- `packages/ui`: React components and design tokens. `packages/config`: tsconfig and ESLint.

## Rules

- `packages/core` stays pure TypeScript: no runtime dependencies except the parsers, zod, nanoid
  and prettier, and 100% test coverage (the `test` script enforces it).
- Colors come from design tokens (`packages/ui/src/styles/globals.css`), never literals or
  Tailwind's palette; `packages/ui/src/tokens.test.ts` enforces it.
- The editor is local-first: projects live in the user's browser. Nothing in this repository needs
  an account, a database of its own or a server beyond Next.js.
- Commits use Conventional Commits (commitlint), scoped by package (`core`, `web`, `ui`,
  `edition`, `config`). User-facing changes need a changeset (`pnpm changeset`).
- Contributors sign the CLA (`CLA.md`); the CLA bot asks on their first pull request.
- Before committing: `pnpm lint`, `pnpm typecheck` and `pnpm test`; `pnpm test:db` (Postgres and
  MySQL from `docker compose up -d`) when SQL generation or parsers change.
- Update the docs (`apps/web/content/docs`, package READMEs) when behaviour changes.
