import { qkey } from '../../diff/defs';
import type { Rule } from '../types';
import { sqlFor } from './shared';

export const createIndexBlocking: Rule = {
  id: 'create-index-blocking',
  dialects: ['postgres'],
  check(op, ctx) {
    if (op.kind !== 'createIndex' || ctx.isNewTable(op.table)) return null;
    // generateSQL builds non-unique indexes CONCURRENTLY unless told not to.
    if (!op.index.unique && ctx.concurrentIndexes) return null;
    const { table: t, col } = sqlFor(ctx.dialect);
    const unique = op.index.unique ? 'UNIQUE ' : '';
    const columns = op.index.columns
      .map((c) => `${col(c.name)}${c.order === 'desc' ? ' DESC' : ''}`)
      .join(', ');
    const where = op.index.where ? ` WHERE ${op.index.where}` : '';
    return {
      severity: ctx.sized(op.table, 'caution', true),
      title: `Creating index ${op.index.name} blocks writes to ${qkey(op.table)}`,
      explanation:
        'A plain CREATE INDEX takes a SHARE lock: inserts, updates and deletes on the table wait ' +
        'until the whole index is built, which on a large table can take minutes.',
      saferAlternative:
        '-- Outside a transaction block; if it fails, drop the INVALID index and retry.\n' +
        `CREATE ${unique}INDEX CONCURRENTLY ${col(op.index.name)} ON ${t(op.table)} (${columns})${where};`,
    };
  },
};
