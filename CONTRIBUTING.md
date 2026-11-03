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
cp apps/web/.env.example apps/web/.env.local
docker compose up -d       # optional: only needed for test:db
pnpm dev                   # http://localhost:3000
```

The pre-commit hook runs [gitleaks](https://github.com/gitleaks/gitleaks), so it must be on your
`PATH`: `winget install --id Gitleaks.Gitleaks -e` or `brew install gitleaks`.

| Script                                  | Does                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `build` / `test` / `lint` / `typecheck` | Turbo across all workspaces                                                        |
| `test:db`                               | DB integration tests (`*.db.test.ts`, needs compose)                               |
| `e2e`                                   | Playwright (run `pnpm --filter @dashdb/web exec playwright install chromium` once) |
| `format` / `format:check`               | Prettier                                                                           |

## Architecture overview

DashDB is a pnpm + Turborepo monorepo, TypeScript strict everywhere.

```
apps/
  web/            Next.js App Router + Tailwind v4: the editor (src/editor), the site, docs, blog
packages/
  core/           The engine: schema IR, parsers, serializers, diff, migration SQL, safety rules
  shared/         zod schemas + types used everywhere (no Node/React deps)
  edition/        Which edition this build is, and the interfaces paid editions plug into
  ui/             Shared React components and design tokens
  config/         Shared tsconfig bases, ESLint flat configs, Tailwind preset
```

This repository is DashDB Community. Paid cloud, Team and Enterprise features are developed in a
separate private repository that uses this one as a git submodule, so nothing here needs a
server, a database of its own or an account. They plug in only through `packages/edition`, and an
ESLint rule rejects imports of `@dashdb-cloud/*` or of paths outside this repository.

Dependencies point one way: `apps -> ui/core/edition -> shared`, with `config` as a
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
or app as the scope (`core`, `web`, `ui`, `edition`, `config`).

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

### Sign the CLA (once)

Before your first pull request can be merged, you sign DashDB's
[Contributor License Agreement](CLA.md). A bot comments on the pull request with a sentence to
reply with; reply once and you're done for this and every future pull request.

**Why a CLA?** DashDB Community is AGPL, and it stays that way. The same code also ships in
DashDB's paid cloud, Team and Enterprise editions, which are developed separately under a
commercial license. The AGPL alone doesn't let us include your contribution there, so the CLA asks
for that permission. In plain terms:

- You keep the copyright to what you wrote.
- You let DashDB use and distribute it under other licenses too, including the commercial one.
- You confirm it's yours to give (you wrote it, or your employer agrees).

That's what lets one codebase serve both the free and the paid editions, instead of the paid
editions drifting away from what you contributed. Questions: licensing@dashdb.dev.

## License

DashDB Community is AGPL: everything in this repository is under [AGPL-3.0](LICENSE). Paid cloud,
Team and Enterprise features are developed separately under a commercial license. Your
contribution is licensed under AGPL-3.0, plus the rights you grant in the [CLA](CLA.md).
