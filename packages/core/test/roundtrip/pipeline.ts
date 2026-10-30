import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import { z } from 'zod';
import { labels } from '../../src/diff/__test-utils__/harness';
import { diffSchemas } from '../../src/diff/diff';
import type { Schema } from '../../src/ir/types';
import { generateSQL } from '../../src/migrations/sql';
import type { MigrationDialect } from '../../src/migrations/types';
import { parseMySQLDDL, parsePostgresDDL } from '../../src/parsers';
import { openDatabase } from './db';

export const FIXTURES = join(import.meta.dirname, 'fixtures', 'migrations');

export const metaSchema = z.object({
  dialect: z.enum(['postgres', 'mysql']),
  description: z.string().min(1),
  /** Rename keys passed to diffSchemas as confirmedRenames. */
  renames: z.array(z.string()).optional(),
  /** The down migration cannot restore the before-schema (e.g. removed enum values). */
  irreversible: z.boolean().optional(),
});
export type Meta = z.infer<typeof metaSchema>;

export interface RoundTripCase {
  readonly name: string;
  readonly before: string;
  readonly after: string;
  readonly meta: Meta;
}

export function loadCases(dialect: MigrationDialect): RoundTripCase[] {
  return readdirSync(FIXTURES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = join(FIXTURES, d.name);
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const read = (file: string) => readFileSync(join(dir, file), 'utf8');
      return {
        name: d.name,
        before: read('before.sql'),
        after: read('after.sql'),
        meta: metaSchema.parse(JSON.parse(read('meta.json'))),
      };
    })
    .filter((c) => c.meta.dialect === dialect)
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

export function parseSql(dialect: MigrationDialect, sql: string): Schema {
  const result = dialect === 'postgres' ? parsePostgresDDL(sql) : parseMySQLDDL(sql);
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length)
    throw new Error(`after.sql does not parse:\n${errors.map((d) => d.message).join('\n')}`);
  return result.schema;
}

/** Fails unless the two schemas are the same to the diff engine (ids and order are ignored). */
export function assertSameSchema(step: string, actual: Schema, expected: Schema): void {
  const ops = diffSchemas(actual, expected).operations;
  if (ops.length) {
    throw new Error(
      `${step}: the database differs from the expected schema; it would need:\n  ${labels(ops).join('\n  ')}\n${JSON.stringify(ops, null, 1).slice(0, 4000)}`,
    );
  }
}

/**
 * The same schema with CHECK expressions blanked out. Engines store their own canonical
 * spelling of an expression (Postgres turns `x IN (…)` into `x = ANY (ARRAY[…])`, MySQL adds
 * backticks and charset introducers), so source text and catalog text are compared by name.
 */
function withoutCheckText(schema: Schema): Schema {
  return {
    ...schema,
    tables: schema.tables.map((t) => ({
      ...t,
      checks: t.checks.map((ch) => ({ ...ch, expression: 'true' })),
    })),
  };
}

const checksOf = (schema: Schema) =>
  schema.tables
    .flatMap((t) => t.checks.map((ch) => `${t.name}.${ch.name}: ${ch.expression}`))
    .sort();

/**
 * The round trip: before.sql → database → introspect (A); parse after.sql (B); diff A → B;
 * apply up → introspect (C) ≡ B; apply down → introspect (D) ≡ A.
 *
 * C is compared with B in full except for CHECK expression text; its CHECK expressions are
 * compared with R's: after.sql run on a second fresh database, i.e. the engine's own spelling.
 */
export async function roundTrip(c: RoundTripCase): Promise<void> {
  const { dialect } = c.meta;
  const db = await openDatabase(dialect, c.name);
  const reference = await openDatabase(dialect, `${c.name}_ref`);
  try {
    await db.exec(c.before);
    const a = await db.introspect();
    const b = parseSql(dialect, c.after);
    await reference.exec(c.after);
    const r = await reference.introspect();
    const diff = diffSchemas(a, b, { confirmedRenames: c.meta.renames ?? [] });
    const migration = generateSQL(diff, dialect);

    await db.migrate(migration.statements);
    const up = await db.introspect();
    assertSameSchema('after up (vs after.sql parsed)', withoutCheckText(up), withoutCheckText(b));
    expect(checksOf(up), 'after up: CHECK expressions (vs after.sql run directly)').toEqual(
      checksOf(r),
    );

    if (!c.meta.irreversible) {
      await db.migrate(migration.downStatements);
      assertSameSchema('after down', await db.introspect(), a);
    }
  } finally {
    await Promise.all([db.close(), reference.close()]);
  }
}
