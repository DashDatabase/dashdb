import { qkey } from '../../diff/defs';
import type { Rule } from '../types';
import { numberedSteps, sqlFor } from './shared';

export const addNotNullWithoutDefault: Rule = {
  id: 'add-not-null-without-default',
  dialects: ['postgres'],
  check(op, ctx) {
    if (op.kind !== 'addColumn') return null;
    const c = op.column;
    if (c.nullable || c.default !== null || c.autoIncrement || ctx.isNewTable(op.table))
      return null;
    const { table: t, col } = sqlFor(ctx.dialect);
    const check = col(`${c.name}_not_null`);
    return {
      severity: ctx.sized(op.table, 'dangerous'),
      title: `Adding NOT NULL column ${qkey(op.table)}.${c.name} without a default fails on existing rows`,
      explanation:
        'Postgres must fill the new column for every existing row; with no default the value is ' +
        'NULL, which violates NOT NULL, so the migration fails on any table that has rows.',
      saferAlternative: numberedSteps([
        `Add the column as nullable:\n   ALTER TABLE ${t(op.table)} ADD COLUMN ${col(c.name)} ${c.nativeType};`,
        'Deploy code that writes it, then backfill existing rows in batches.',
        `Enforce NOT NULL without a long lock:\n   ALTER TABLE ${t(op.table)} ADD CONSTRAINT ${check} CHECK (${col(c.name)} IS NOT NULL) NOT VALID;\n   ALTER TABLE ${t(op.table)} VALIDATE CONSTRAINT ${check};\n   ALTER TABLE ${t(op.table)} ALTER COLUMN ${col(c.name)} SET NOT NULL;\n   ALTER TABLE ${t(op.table)} DROP CONSTRAINT ${check};`,
        'Or give the column a constant DEFAULT, which Postgres 11+ adds without rewriting the table.',
      ]),
    };
  },
};
