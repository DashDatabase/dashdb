# Round-trip tests on real databases

These tests prove the whole migration pipeline against real engines (Postgres 17 and MySQL 8.4),
not just against the IR:

```
before.sql ─▶ database ─▶ introspect ─▶ A
after.sql  ─▶ parse ─────────────────▶ B
diff(A → B) ─▶ generateSQL ─▶ up ─▶ introspect ─▶ C   assert C ≡ B
                              down ─▶ introspect ─▶ D  assert D ≡ A   (unless irreversible)
```

- **Introspection** uses DashDB's own catalog queries (`src/introspection`), the same ones
  live connections use.
- **`≡` means "the diff engine finds nothing to do"** (`diffSchemas(x, y).operations` is
  empty). Ids, column order, type aliases and other cosmetic differences are ignored;
  everything DashDB models is compared.
- **CHECK expressions:** engines store their own spelling of a CHECK expression. For
  example, Postgres turns `x IN ('a', 'b')` into `x = ANY (ARRAY['a'::text, 'b'::text])`.
  So C's expressions are compared with what the engine makes of `after.sql` when run
  directly on a second fresh database.

Every case gets its own fresh database. Cases run concurrently, one container per engine.

## Running

Docker must be running. Testcontainers pulls `postgres:17` and `mysql:8.4` on first use.

```sh
pnpm --filter @dashdb/core test:db                     # everything, as CI runs it
pnpm --filter @dashdb/core exec vitest run --config vitest.db.config.ts test/roundtrip
pnpm --filter @dashdb/core exec vitest run --config vitest.db.config.ts test/roundtrip -t pg-indexes
```

Set `TESTCONTAINERS_REUSE_ENABLE=true` to keep the containers between runs. Reruns then
take seconds instead of waiting for both engines to boot.

## Adding a fixture case

Create a folder under `fixtures/migrations/` named `pg-<topic>` or `my-<topic>` (kebab-case),
with three files:

| File         | Contents                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `before.sql` | DDL for the starting schema. It may be empty (start from an empty database), and may also insert rows. |
| `after.sql`  | DDL for the target schema. It must parse with DashDB's parser without errors.                          |
| `meta.json`  | The case's metadata (see below).                                                                       |

```json
{
  "dialect": "postgres",
  "description": "rename an indexed column",
  "renames": ["column:public.users.name=>public.users.full_name"],
  "irreversible": false
}
```

- **`dialect`:** `postgres` or `mysql`.
- **`description`:** shown in the test name. Say what the case covers.
- **`renames`** (optional): renames the diff should apply instead of drop + add. These keys
  are passed as `confirmedRenames`.
  - Tables: `table:<schema>.<old>=><schema>.<new>`.
  - Columns: `column:<schema>.<old table>.<old column>=><schema>.<new table>.<new column>`.
  - The schema is `public` (or the actual schema) on Postgres, and `default` on MySQL.
- **`irreversible`** (optional): set it to `true` when the down migration cannot bring the
  database back to the before-state, so step 5 is skipped. An example is removing an enum
  value from a column that holds rows. Prefer making a case reversible.

Keep each case to one theme, so a failure says what broke. Then run the suite. If a case
fails, the error lists the operations the diff engine would still need, either from the
migrated database to `after.sql` or back to `before.sql`.

## Property tests

`property.db.test.ts` generates random schemas and random edit sequences with
[fast-check](https://fast-check.dev):

- **Schemas:** tables with typed columns, defaults, an index, a unique key and foreign keys.
- **Edits:** add, drop, rename and retype columns; toggle NOT NULL, defaults, indexes and
  unique keys; add and drop foreign keys; add, drop and rename tables.

Both states are written in DashDB's canonical DDL (our parser, then our serializer), and each
case goes through the same round trip.

- CI uses a fixed seed and 25 runs per engine. Override them with `FC_SEED=<n>` and
  `FC_RUNS=<n>`, for example to hunt with more runs locally.
- **Failures become fixtures automatically.** fast-check shrinks the counterexample, and the
  test writes it to `fixtures/migrations/<pg|my>-prop-<seed>-<path>/` (with `meta.json`
  recording the seed, path and error), then fails with the folder's path. Fix the bug, rename
  the folder to describe it, and commit it. It is then a regular fixture case for good.
