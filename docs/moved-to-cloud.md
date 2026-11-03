# Moved to the cloud repository

Internal note. On 2026-11-03 the code below moved from this public repository to the private
`dashdatabase/dashdb-cloud` repository, which consumes this one as a git submodule. This
repository is DashDB Community (AGPL-3.0); server, database, billing, auth, collaboration and
enterprise code lives in the cloud repository. The full code is still in this repository's git
history before that date.

## Removed paths

| Path                                                        | What it was                                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `apps/api/`                                                 | The `@dashdb/api` HTTP server (Hono on Node, port 8787). Only a health route so far.                             |
| `packages/api-client/`                                      | `@dashdb/api-client`, the typed Hono RPC client for `@dashdb/api`.                                               |
| `packages/db/`                                              | `@dashdb/db`: the Drizzle schema, client and migrations for DashDB's own Postgres database (the waitlist table). |
| `ee/`                                                       | The placeholder for commercial features and its license. Empty; replaced by the separate repository.             |
| `packages/shared`: `healthResponseSchema`, `HealthResponse` | The API's health response contract. `DB_DIALECTS` and `dbDialectSchema` stay; core uses them.                    |
| `apps/web/src/lib/config.ts`: `getApiUrl`                   | The API's base URL (`NEXT_PUBLIC_API_URL`). Nothing in the web app called it.                                    |
| `apps/web/src/lib/waitlist/store.ts`: `postgresStore`       | Saving waitlist signups to Postgres through `@dashdb/db` (`DATABASE_URL`).                                       |
| Root `package.json`: `db:generate`, `db:migrate`            | drizzle-kit scripts for `packages/db`.                                                                           |
| `docker-compose.yml`: `redis`, `mailpit`                    | Local services for the API. Postgres and MySQL stay, for the round-trip tests.                                   |
| `.github/workflows/dco.yml`                                 | The DCO sign-off check, replaced by the CLA (`cla.yml`).                                                         |

## What changed here because of it

- The waitlist on dashdb.dev keeps working through its Resend store (`RESEND_API_KEY`,
  `RESEND_AUDIENCE_ID`). `DATABASE_URL` is no longer read.
- The CI database job no longer runs migrations; it only starts Postgres and MySQL for
  `pnpm test:db`.
- The edition (`getEdition`, `isCloudEdition`) moved from `apps/web/src/lib/config.ts` to the new
  `packages/edition`, the only place paid builds plug in.
- An ESLint rule rejects imports of `@dashdb-cloud/*` and relative imports that leave the
  repository.
