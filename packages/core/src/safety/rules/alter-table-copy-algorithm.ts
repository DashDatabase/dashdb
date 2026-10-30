import { qkey } from '../../diff/defs';
import type { Operation } from '../../diff/types';
import { mysqlStatements } from '../../migrations/sql/mysql';
import type { Rule } from '../types';
import { parseType, tablesOf } from './shared';

/** VARCHAR lengths up to 255 bytes use a 1-byte length prefix; assumes utf8mb4 (4 bytes/char). */
const ONE_BYTE_PREFIX_CHARS = 63;

/** Whether MySQL 8 changes this column type in place (VARCHAR widening in the same prefix class). */
export function isMysqlInplaceType(from: string, to: string): boolean {
  const a = parseType('mysql', from);
  const b = parseType('mysql', to);
  if (a.base !== 'varchar' || b.base !== 'varchar') return false;
  const before = a.args[0] as number;
  const after = b.args[0] as number;
  return after >= before && (before > ONE_BYTE_PREFIX_CHARS || after <= ONE_BYTE_PREFIX_CHARS);
}

/** Operations MySQL 8 can only run with ALGORITHM=COPY, blocking writes while it copies the table. */
export function needsCopy(op: Operation): boolean {
  switch (op.kind) {
    case 'alterColumnType':
      return !isMysqlInplaceType(op.from.nativeType, op.to.nativeType);
    case 'dropPrimaryKey':
      return true;
    case 'recreateEnum':
      // Appending values is instant; removing or reordering them copies the table.
      return op.columns.length > 0;
    default:
      return false;
  }
}

/** The statements generateSQL emits for one operation, with ALGORITHM/LOCK clauses appended. */
export function withAlgorithm(op: Operation): string {
  return mysqlStatements([op])
    .map((s) => s.sql.replace(/;$/, ', ALGORITHM=INPLACE, LOCK=NONE;'))
    .join('\n');
}

export const alterTableCopyAlgorithm: Rule = {
  id: 'alter-table-copy-algorithm',
  dialects: ['mysql'],
  check(op, ctx) {
    if (!needsCopy(op)) return null;
    const tables = tablesOf(op);
    const severities = tables.map((t) => ctx.sized(t, 'caution', true));
    const severity = severities.includes('dangerous')
      ? 'dangerous'
      : severities.includes('caution')
        ? 'caution'
        : 'info';
    return {
      severity,
      title: `This change copies ${tables.map(qkey).join(', ')} with ALGORITHM=COPY`,
      explanation:
        'MySQL cannot make this change in place: it builds a full copy of the table and blocks ' +
        'writes (LOCK=SHARED) until the copy finishes, which on a large table can take hours.',
      saferAlternative:
        '-- Ask for an online change; MySQL refuses immediately instead of locking if it cannot:\n' +
        `${withAlgorithm(op)}\n` +
        '-- If it is refused, run the change with gh-ost or pt-online-schema-change instead.',
    };
  },
};
