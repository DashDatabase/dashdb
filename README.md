# DashDB

pnpm + Turborepo monorepo. Node 22 (`.nvmrc`), TypeScript strict everywhere.

```
apps/
  web/            Next.js App Router + Tailwind v4 (src/). Runs on :3000. Playwright specs in e2e/
  api/            Hono on Node: tsx watch for dev, tsup for build. Runs on :8787 (GET /health)
packages/
  config/         Shared tsconfig bases, ESLint flat configs, Tailwind preset (preset.css)
  shared/         zod schemas + types used everywhere (no Node/React deps)
  core/           Framework-agnostic domain logic (depends on shared only)
  db/             Drizzle schema, client, and migrations for the Postgres metadata DB
  api-client/     Typed Hono RPC client, with types inferred from apps/api's AppType
  ui/             Shared React components (styled with the config preset)
docker-compose.yml  Postgres 17, MySQL 8.4, Redis 7, Mailpit (local dev only)
turbo.json          Task graph: packages build (tsup -> dist/) before anything that uses them
```

Dependency direction: `apps -> api-client/ui/db/core -> shared`, with `config` as a devDependency of everything.
Each package has `package.json` `exports`, `src/index.ts`, `vitest.config.ts` and a `README.md`.

## Quick start

```sh
nvm use && pnpm install
cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env.local
docker compose up -d       # optional: only needed for db:* and test:db
pnpm dev                   # web :3000, api :8787
```

| Script                                  | Does                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `build` / `test` / `lint` / `typecheck` | Turbo across all workspaces                                                        |
| `test:db`                               | DB integration tests (`*.db.test.ts`, needs compose)                               |
| `e2e`                                   | Playwright (run `pnpm --filter @dashdb/web exec playwright install chromium` once) |
| `db:generate` / `db:migrate`            | drizzle-kit in `packages/db`                                                       |
| `format`                                | Prettier                                                                           |

## Code quality & security

- **Lint**: shared ESLint flat configs in `packages/config/eslint` (typescript-eslint `strictTypeChecked`,
  `eslint-plugin-security`, `import/no-cycle`, React + hooks rules for `ui` and `web`). Lint fails on warnings.
- **Format**: Prettier with `prettier-plugin-tailwindcss` (`pnpm format`, `pnpm format:check`).
- **Git hooks** (Husky, installed by `pnpm install`):
  - `pre-commit`: [gitleaks](https://github.com/gitleaks/gitleaks) on staged changes, then lint-staged
    (`eslint --fix` + `prettier --write` on staged files). **gitleaks must be on your PATH**:
    `winget install --id Gitleaks.Gitleaks -e` / `brew install gitleaks`.
  - `commit-msg`: commitlint with [Conventional Commits](https://www.conventionalcommits.org).
- **CI** (`.github/workflows/ci.yml`): lint, typecheck, test, build, plus a `db-tests` job against Postgres.
- **Security** (`.github/workflows/security.yml`, also weekly): CodeQL, gitleaks over full history,
  `pnpm audit --audit-level=high`, and Semgrep (`p/owasp-top-ten`, `p/typescript`).
- **Dependabot**: weekly, with minor and patch updates grouped into one PR per ecosystem.
- Reporting vulnerabilities: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
