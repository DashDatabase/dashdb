// Short guides for each safety rule, linked from findings in the Migration panel
// (`/guides/<dialect>/<rule-id>`). Keep the ids in sync with @dashdb/core's `rules`.

export interface RuleGuide {
  readonly title: string;
  /** What goes wrong, in a sentence or two. */
  readonly risk: string;
  /** Why it happens. */
  readonly why: string;
  /** The safer way, as ordered steps. */
  readonly saferSteps: readonly string[];
  /** Optional dialect-specific remarks. */
  readonly notes?: Partial<Record<'postgres' | 'mysql', string>>;
}

export const RULE_GUIDES: Readonly<Record<string, RuleGuide>> = {
  'add-fk-validating': {
    title: 'Adding a foreign key to an existing table',
    risk: 'Writes to both tables stall while Postgres checks every existing row.',
    why: 'ADD FOREIGN KEY validates all rows under a SHARE ROW EXCLUSIVE lock on the table and the table it references.',
    saferSteps: [
      'Add the constraint with NOT VALID: it applies to new rows immediately and skips the scan.',
      'In a separate transaction, run VALIDATE CONSTRAINT, which only takes a SHARE UPDATE EXCLUSIVE lock.',
    ],
  },
  'add-not-null-without-default': {
    title: 'Adding a NOT NULL column without a default',
    risk: 'The migration fails on any table that already has rows.',
    why: 'Existing rows get NULL in the new column, which violates NOT NULL.',
    saferSteps: [
      'Add the column as nullable.',
      'Deploy code that writes the column, then backfill existing rows in batches.',
      'Add a CHECK (column IS NOT NULL) NOT VALID constraint, validate it, then SET NOT NULL and drop the check.',
      'Or give the column a constant DEFAULT, which Postgres 11+ adds without rewriting the table.',
    ],
  },
  'alter-table-copy-algorithm': {
    title: 'Changes MySQL makes with ALGORITHM=COPY',
    risk: 'Writes are blocked while MySQL copies the whole table, which can take hours.',
    why: 'Some changes (column type changes, reordering, some charset changes) cannot be done in place.',
    saferSteps: [
      'Request ALGORITHM=INPLACE (or INSTANT) and LOCK=NONE explicitly: MySQL refuses immediately instead of locking if it cannot.',
      'If it is refused, use an online schema-change tool such as gh-ost or pt-online-schema-change.',
    ],
  },
  'alter-type-rewrite': {
    title: 'Changing a column type that rewrites the table',
    risk: 'All reads and writes block until every row is rewritten and indexes are rebuilt.',
    why: 'Most type changes need an ACCESS EXCLUSIVE lock and a full rewrite; values that do not convert make it fail part-way.',
    saferSteps: [
      'Add a new column with the new type (expand).',
      'Deploy code that writes both columns, and backfill the new one in batches.',
      'Move reads to the new column, then drop the old one in a later migration (contract).',
    ],
    notes: {
      postgres:
        'Widening varchar(n), or varchar to text, does not rewrite the table and is not flagged.',
    },
  },
  'create-index-blocking': {
    title: 'Creating an index without CONCURRENTLY',
    risk: 'Inserts, updates and deletes wait until the whole index is built.',
    why: 'A plain CREATE INDEX holds a SHARE lock on the table for the entire build.',
    saferSteps: [
      'Use CREATE INDEX CONCURRENTLY, outside a transaction block.',
      'If it fails, drop the INVALID index it leaves behind and retry.',
    ],
    notes: {
      postgres:
        'Prisma and Drizzle run each migration file in a transaction, so put the concurrent index in a migration of its own.',
    },
  },
  'drop-column': {
    title: 'Dropping a column',
    risk: 'The values are gone for good, and running code that still uses the column fails.',
    why: 'DROP COLUMN discards data; the down migration can only recreate an empty column. ORMs that list columns explicitly break immediately.',
    saferSteps: [
      'Deploy code that no longer reads or writes the column (remove it from ORM models).',
      'Copy the values somewhere if they might be needed.',
      'Drop the column in a later migration.',
    ],
  },
  'drop-table': {
    title: 'Dropping a table',
    risk: 'Every row is deleted, and code that still queries the table fails.',
    why: 'The down migration can recreate the structure but not the data.',
    saferSteps: [
      'Deploy code that no longer uses the table.',
      'Rename the table instead of dropping it, so it can be restored.',
      'After a safe period and a backup, drop it.',
    ],
  },
  'enum-value-removal': {
    title: 'Removing values from an enum',
    risk: 'The migration fails on any row that still holds a removed value, after locking the tables that use the enum.',
    why: 'Postgres cannot drop enum values, so the type is recreated and every column using it is converted.',
    saferSteps: [
      'Move rows off the removed values first, in batches on large tables.',
      'Then remove the values.',
    ],
  },
  'large-table-online-change': {
    title: 'Rebuilding a large MySQL table in place',
    risk: 'Even an online ALTER can cause a long outage on a large table.',
    why: 'It takes metadata locks at the start and end, replays the change log, and lags replicas for the whole rebuild.',
    saferSteps: [
      'Run the change with gh-ost or pt-online-schema-change, which copy in small chunks and cut over atomically.',
      'Try it with --dry-run first.',
    ],
  },
  'rename-breaks-app': {
    title: 'Renaming a table or column',
    risk: 'Instances still running the previous release fail until they are replaced.',
    why: 'The rename is instant, but deploys are never atomic with migrations, so some requests use the old name.',
    saferSteps: [
      'Add the new name next to the old one (expand).',
      'Deploy code that writes both, and backfill.',
      'Move reads to the new name, then remove the old one in a later migration (contract).',
    ],
  },
  'set-not-null-scan': {
    title: 'SET NOT NULL on an existing column',
    risk: 'Reads and writes block while Postgres scans the table, and it fails if any row is NULL.',
    why: 'SET NOT NULL verifies every row under an ACCESS EXCLUSIVE lock.',
    saferSteps: [
      'Add CHECK (column IS NOT NULL) NOT VALID.',
      'VALIDATE CONSTRAINT, which does not block writes.',
      'SET NOT NULL: Postgres 12+ uses the validated check and skips the scan. Then drop the check.',
    ],
  },
  'volatile-default-rewrite': {
    title: 'Adding a column with a volatile default',
    risk: 'Postgres rewrites the whole table under an ACCESS EXCLUSIVE lock.',
    why: 'A constant default is stored once, but a volatile one (random(), a new UUID, a sequence value) is computed for every existing row.',
    saferSteps: [
      'Add the column without a default.',
      'Set the default for new rows.',
      'Backfill existing rows in batches.',
      'Add NOT NULL with the CHECK … NOT VALID pattern if needed.',
    ],
  },
};

export const DIALECT_NAMES = { postgres: 'PostgreSQL', mysql: 'MySQL' } as const;
export type GuideDialect = keyof typeof DIALECT_NAMES;

export function isGuideDialect(value: string): value is GuideDialect {
  return Object.hasOwn(DIALECT_NAMES, value);
}
