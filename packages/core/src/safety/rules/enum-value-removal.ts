import { qkey } from '../../diff/defs';
import { sqlString } from '../../serializers/sql-common';
import type { Rule } from '../types';
import { sqlFor } from './shared';

export const enumValueRemoval: Rule = {
  id: 'enum-value-removal',
  dialects: ['postgres'],
  check(op, ctx) {
    if (op.kind !== 'recreateEnum') return null;
    const removed = op.from.filter((v) => !op.to.includes(v));
    if (!removed.length) return null;
    const { table: t, col } = sqlFor(ctx.dialect);
    const used = op.columns.filter((c) => !ctx.isNewTable(c.table) && ctx.rows(c.table) !== 0);
    const list = removed.map((v) => sqlString(v, 'postgres')).join(', ');
    const updates = op.columns.map(
      (c) =>
        `UPDATE ${t(c.table)} SET ${col(c.column)} = '<replacement>' WHERE ${col(c.column)} IN (${list});`,
    );
    return {
      severity: used.length ? 'dangerous' : 'info',
      title: `Removing ${removed.join(', ')} from enum ${qkey(op.enum)} fails on rows that hold them`,
      explanation:
        'Postgres cannot drop an enum value, so the type is recreated and every column using it ' +
        'is converted, rewriting those tables under an ACCESS EXCLUSIVE lock. Any row still ' +
        'holding a removed value makes the conversion fail.',
      saferAlternative: updates.length
        ? `-- Move rows off the removed values first (in batches on large tables):\n${updates.join('\n')}`
        : 'No column uses the enum, so no rows need to change.',
    };
  },
};
