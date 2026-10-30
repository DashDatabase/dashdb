import { qkey } from '../../diff/defs';
import type { Rule } from '../types';
import { sqlFor } from './shared';

export const setNotNullScan: Rule = {
  id: 'set-not-null-scan',
  dialects: ['postgres'],
  check(op, ctx) {
    if (op.kind !== 'alterColumnNullability' || op.to || ctx.isNewTable(op.table)) return null;
    const { table: t, col } = sqlFor(ctx.dialect);
    const check = col(`${op.column}_not_null`);
    return {
      severity: ctx.sized(op.table, 'caution', true),
      title: `SET NOT NULL on ${qkey(op.table)}.${op.column} scans the table under an exclusive lock`,
      explanation:
        'SET NOT NULL verifies every row while holding an ACCESS EXCLUSIVE lock, blocking reads ' +
        'and writes for the whole scan; it also fails if any row is still NULL.',
      saferAlternative: [
        `ALTER TABLE ${t(op.table)} ADD CONSTRAINT ${check} CHECK (${col(op.column)} IS NOT NULL) NOT VALID;`,
        `ALTER TABLE ${t(op.table)} VALIDATE CONSTRAINT ${check};`,
        '-- Postgres 12+ uses the validated check and skips the scan:',
        `ALTER TABLE ${t(op.table)} ALTER COLUMN ${col(op.column)} SET NOT NULL;`,
        `ALTER TABLE ${t(op.table)} DROP CONSTRAINT ${check};`,
      ].join('\n'),
    };
  },
};
