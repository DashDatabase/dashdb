# Contributing to DashDB

Thanks for helping! Bug reports, fixes, docs, safety rules, parser improvements and schema
templates are all welcome. By taking part you agree to follow our
[Code of Conduct](CODE_OF_CONDUCT.md).

- **Found a bug?** Open a [bug report](https://github.com/DashDatabase/dashdb/issues/new?template=bug_report.yml)
  with the schema that triggers it. A `.dashdb.json` project file (Export → DashDB project) or
  the SQL / Prisma / DBML source is the most useful thing you can attach.
- **Have an idea?** Open a [feature request](https://github.com/DashDatabase/dashdb/issues/new?template=feature_request.yml),
  or start a thread in [Discussions](https://github.com/DashDatabase/dashdb/discussions).
- **Security problem?** Follow [SECURITY.md](SECURITY.md). Please don't open a public issue.
- **First time?** Issues labelled [`good first issue`](https://github.com/DashDatabase/dashdb/labels/good%20first%20issue)
  are small and well scoped. Comment on one before starting so nobody duplicates work.

## Setup

You need Node.js 22 (see `.nvmrc`), pnpm 9 and Git. Docker is optional: it is only used for the
database integration tests.

```sh
git clone https://github.com/DashDatabase/dashdb.git
cd dashdb
nvm use && pnpm install
cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env.local
docker compose up -d       # optional: only needed for db:* and test:db
pnpm dev                   # web :3000, api :8787
```

The pre-commit hook runs [gitleaks](https://github.com/gitleaks/gitleaks), so it must be on your
`PATH`: `winget install --id Gitleaks.Gitleaks -e` or `brew install gitleaks`.

| Script                                  | Does                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `build` / `test` / `lint` / `typecheck` | Turbo across all workspaces                                                        |
| `test:db`                               | DB integration tests (`*.db.test.ts`, needs compose)                               |
| `e2e`                                   | Playwright (run `pnpm --filter @dashdb/web exec playwright install chromium` once) |
| `db:generate` / `db:migrate`            | drizzle-kit in `packages/db`                                                       |
| `format` / `format:check`               | Prettier                                                                           |

## Architecture overview

DashDB is a pnpm + Turborepo monorepo, TypeScript strict everywhere.

```
apps/
  web/            Next.js App Router + Tailwind v4: the editor (src/editor), the site, docs, blog
  api/            Hono on Node (:8787)
packages/
  core/           The engine: schema IR, parsers, serializers, diff, migration SQL, safety rules
  shared/         zod schemas + types used everywhere (no Node/React deps)
  db/             Drizzle schema, client and migrations for the Postgres metadata DB
  api-client/     Typed Hono RPC client, with types inferred from apps/api's AppType
  ui/             Shared React components and design tokens
  config/         Shared tsconfig bases, ESLint flat configs, Tailwind preset
ee/               Reserved for commercial features (separate license, empty for now)
```

Dependencies point one way: `apps -> api-client/ui/db/core -> shared`, with `config` as a
devDependency of everything. Each package has `package.json` `exports`, `src/index.ts`,
`vitest.config.ts` and a `README.md`.

Inside `packages/core`, everything flows through one dialect-neutral model, the **IR**
(`src/ir`):

```
SQL / Prisma / DBML / introspection JSON
        │  parsers/        → IR + diagnostics
        ▼
       IR  ──────────────→ serializers/  → Postgres, MySQL, Prisma, Drizzle, DBML, Mermaid
        │
        │  diff/           → ordered operations between two IRs (baseline vs. current)
        ▼
   operations ──→ migrations/ → up/down SQL, Prisma and Drizzle migration files
              └─→ safety/     → findings: risky locks, rewrites, data loss, safer alternatives
```

The editor in `apps/web` is a client of that engine and never talks to a database: projects
live in the browser.

## How to add a parser rule

Parsers live in `packages/core/src/parsers`, one per format (`postgres.ts`, `mysql.ts`,
`prisma.ts`, `dbml.ts`, `introspection.ts`). Each turns source text into a draft schema
(`draft.ts`) and `finalize()`s it into the IR. Anything the parser can't represent becomes a
**diagnostic** with a source location, never a thrown error.

To support a new construct (say, a column option or an `ALTER TABLE` form):

1. **Write the failing test first** in the parser's `*.test.ts`: the smallest input that uses
   the construct, and the IR (or diagnostic) you expect.
2. **Handle it** in the parser. Postgres and MySQL statements are dispatched by kind in
   `applyStatement` / `alterTable`; follow the existing `case` branches. If the construct can't be
   represented in the IR, report a `warning` diagnostic that names it, rather than dropping it
   silently.
3. **Add a real-world fixture** if the construct shows up in real dumps: save the source in
   `src/parsers/__fixtures__/<format>/<name>.<ext>`. `fixtures.test.ts` picks it up
   automatically, checks the IR is valid, and compares it to a snapshot in `__snapshots__`.
   Generate the snapshot with `pnpm --filter @dashdb/core exec vitest run -u` and **review the
   JSON diff** before committing it.
4. **Check the round trip**: `serializers/roundtrip.test.ts` and `cross-format.test.ts`
   serialize every fixture and parse it back, so a construct that parses but doesn't serialize will fail there. Extend the
   serializer if needed.

## How to add a safety rule

Rules live in `packages/core/src/safety/rules`, one small module each. A rule looks at one diff
operation and returns a finding or `null`:

```ts
export const myRule: Rule = {
  id: 'my-rule', // kebab-case; also the guide URL
  dialects: ['postgres'],
  check(op, ctx) {
    if (op.kind !== 'addColumn') return null;
    return {
      severity: ctx.sized(op.table, 'warning'), // downgraded on tables known to be small
      title: '…',
      explanation: 'What happens in the database, and why it hurts.',
      saferAlternative: numberedSteps(['…', '…']),
    };
  },
};
```

1. Add the module and register it in `rules/index.ts`. The order there is the order findings are
   reported in.
2. Add tests in `safety/rules.test.ts`: it fires when it should, it is quieter on empty or small
   tables, and it does **not** fire on the other dialect or on unrelated operations.
3. Write its guide in `apps/web/src/guides/rule-guides.ts` and a worked example in
   `apps/web/src/guides/examples.ts`. The tests fail until the rule, its guide and its example
   all exist. The guide page at `/guides/<dialect>/<rule-id>` and its row in the safety rules docs
   are generated automatically.

## How to add a migration fixture

Migration generation is tested at three levels:

- **Diff scenarios** (`src/diff/scenarios.test.ts`, `edge-cases.test.ts`): a before and after
  schema written as DDL with the `pg()` / `my()` helpers from `diff/__test-utils__/harness.ts`,
  and the operations you expect, in order. `expectRoundTrip` also checks that applying the
  operations to the before-schema yields the after-schema.
- **Golden files** (`src/migrations/golden.test.ts`): the scenarios in
  `migrations/__test-utils__/scenarios.ts` are rendered as SQL, Prisma and Drizzle files and
  compared to `src/migrations/__golden__`. After an intended change, regenerate with
  `vitest run -u` and review the diff like code.
- **Real databases** (`src/migrations/migrations.db.test.ts`): every scenario is applied up,
  down and up again against Postgres and MySQL. Run with `docker compose up -d && pnpm test:db`.

To add a case: add the before/after pair to the scenario that fits (or a new one) in
`scenarios.ts`, add expectations to the diff tests, regenerate the golden files, and run
`pnpm test:db`. Any change to migration SQL must pass against a real database.

## Before you open a pull request

```sh
pnpm lint && pnpm typecheck && pnpm test
docker compose up -d && pnpm test:db   # if you touched SQL generation or parsers
pnpm e2e                               # if you changed the editor or the site
```

- **New behaviour comes with tests.** Lint fails on warnings.
- **Accessibility**: the editor and site are tested with axe; keep them at zero violations.
- **Keep pull requests focused**: one change per PR is easier to review and to revert.

## Commit conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org); the `commit-msg` hook
runs commitlint.

```
feat(core): detect blocking ALTER TYPE on large tables
fix(web): keep the Code tab cursor after an import
docs: explain baselines in the migrations guide
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `ci`. Use the package
or app as the scope (`core`, `web`, `api`, `ui`, `db`).

### Add a changeset

DashDB is versioned and released with [Changesets](https://changesets.dev). If your pull request
changes what users get (a feature, a fix, a new safety rule), add a changeset describing it:

```sh
pnpm changeset
```

Pick the bump (`patch` for fixes, `minor` for features) and write one line for the changelog,
in the user's terms. All packages share one version, so it doesn't matter much which package you
pick. Docs-only and internal changes don't need one.

When changesets reach `main`, a bot opens a **chore: version packages** pull request. Merging
it tags the release, publishes the GitHub release with the changelog, and pushes the signed
multi-arch image to `ghcr.io/dashdatabase/dashdb`.

### Sign your commits (DCO)

Every commit in a pull request must be signed off under the
[Developer Certificate of Origin](https://developercertificate.org): a statement that you wrote
the change, or otherwise have the right to submit it under the project's license. Add the
sign-off with `-s`:

```sh
git commit -s -m "fix(core): parse quoted enum labels"
```

This appends `Signed-off-by: Your Name <you@example.com>`, which must match the commit author. The
**DCO** check on pull requests fails if a commit is missing it. To fix existing commits:
`git rebase --signoff main` and force-push.

<!-- TODO(maintainer): decide between the DCO check (.github/workflows/dco.yml) and CLA Assistant
     (https://github.com/cla-assistant/cla-assistant). A CLA is needed if contributions must be
     relicensable under the commercial license; the DCO alone does not grant that. -->

## License

DashDB is licensed under [AGPL-3.0](LICENSE), except the `/ee` directory, which is under the
[DashDB Commercial License](ee/LICENSE). By contributing, you agree that your contribution
outside `/ee` is licensed under AGPL-3.0.
