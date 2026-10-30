import { qkey } from '../../diff/defs';
import type { Rule } from '../types';
import { numberedSteps, sqlFor } from './shared';

export const dropColumn: Rule = {
  id: 'drop-column',
  dialects: ['postgres', 'mysql'],
  check(op, ctx) {
    if (op.kind !== 'dropColumn') return null;
    const { table: t, col } = sqlFor(ctx.dialect);
    const name = op.column.name;
    return {
      severity: ctx.sized(op.table, 'dangerous'),
      title: `Dropping column ${qkey(op.table)}.${name} deletes its values`,
      explanation:
        'DROP COLUMN discards the column’s data; the down migration recreates it empty. Running ' +
        'application code that selects or inserts the column fails as soon as it is gone, ' +
        'including ORMs that list every column explicitly.',
      saferAlternative: numberedSteps([
        `Deploy application code that no longer reads or writes ${name} (and remove it from ORM models).`,
        `If the values may be needed, copy them first, e.g.\n   CREATE TABLE ${col(`${op.table.name}_${name}_backup`)} AS SELECT * FROM ${t(op.table)};`,
        `Then drop it in a later migration:\n   ALTER TABLE ${t(op.table)} DROP COLUMN ${col(name)};`,
      ]),
    };
  },
};
