import { qkey } from '../../diff/defs';
import type { ColumnDef } from '../../diff/types';
import { defaultSql } from '../../serializers/sql-common';
import type { Rule } from '../types';
import { numberedSteps, sqlFor } from './shared';

const VOLATILE =
  /\b(gen_random_uuid|uuid_generate_v[14]|random|clock_timestamp|timeofday|nextval|txid_current)\s*\(/i;

/** Defaults Postgres must evaluate per row, which forces a table rewrite on ADD COLUMN. */
export function isVolatileDefault(c: ColumnDef): boolean {
  if (c.autoIncrement) return true;
  if (c.default === null) return false;
  if (c.default.kind === 'sequence') return true;
  return c.default.kind === 'expression' && VOLATILE.test(c.default.sql);
}

export const volatileDefaultRewrite: Rule = {
  id: 'volatile-default-rewrite',
  dialects: ['postgres'],
  check(op, ctx) {
    if (op.kind !== 'addColumn' || ctx.isNewTable(op.table) || !isVolatileDefault(op.column))
      return null;
    const { table: t, col } = sqlFor(ctx.dialect);
    const c = op.column;
    const value = c.default?.kind === 'expression' ? defaultSql(c.default, 'postgres') : '<value>';
    return {
      severity: ctx.sized(op.table, 'caution', true),
      title: `Adding ${qkey(op.table)}.${c.name} with a volatile default rewrites the table`,
      explanation:
        'A constant default is stored once, but a volatile one (random, a new UUID, a sequence ' +
        'value) is computed for every existing row, so Postgres rewrites the whole table under ' +
        'an ACCESS EXCLUSIVE lock.',
      saferAlternative: numberedSteps([
        `Add the column without a default:\n   ALTER TABLE ${t(op.table)} ADD COLUMN ${col(c.name)} ${c.nativeType};`,
        `Set the default for new rows:\n   ALTER TABLE ${t(op.table)} ALTER COLUMN ${col(c.name)} SET DEFAULT ${value};`,
        `Backfill existing rows in batches, repeating until 0 rows:\n   WITH batch AS (SELECT ctid FROM ${t(op.table)} WHERE ${col(c.name)} IS NULL LIMIT 10000)\n   UPDATE ${t(op.table)} SET ${col(c.name)} = ${value} FROM batch WHERE ${t(op.table)}.ctid = batch.ctid;`,
        'Then add NOT NULL with the CHECK … NOT VALID pattern if the column needs it.',
      ]),
    };
  },
};
