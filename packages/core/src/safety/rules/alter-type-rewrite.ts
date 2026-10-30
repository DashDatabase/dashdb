import { qkey } from '../../diff/defs';
import { planExpandContract, renderPlan } from '../expand-contract';
import type { Rule } from '../types';
import { parseType } from './shared';

const TEXTUAL = new Set(['varchar', 'text']);

/** Conversions Postgres performs without rewriting the table or rebuilding its indexes. */
export function isPostgresNoRewrite(from: string, to: string): boolean {
  const a = parseType('postgres', from);
  const b = parseType('postgres', to);
  // Unbounded varchar and text are binary-compatible with each other and with any varchar(n).
  if (TEXTUAL.has(a.base) && b.args.length === 0 && TEXTUAL.has(b.base)) return true;
  if (a.base === 'varchar' && b.base === 'varchar') {
    return (b.args[0] as number) >= (a.args[0] ?? Infinity);
  }
  if (a.base === 'numeric' && b.base === 'numeric') {
    if (b.args.length === 0) return true;
    // Same scale, no smaller precision.
    return (
      a.args.length > 0 && b.args[1] === a.args[1] && (b.args[0] as number) >= (a.args[0] as number)
    );
  }
  // Postgres 12+ skips the rewrite when the session time zone is UTC.
  return a.base === 'timestamp' && b.base === 'timestamptz';
}

export const alterTypeRewrite: Rule = {
  id: 'alter-type-rewrite',
  dialects: ['postgres'],
  check(op, ctx) {
    if (op.kind !== 'alterColumnType' || ctx.isNewTable(op.table)) return null;
    if (isPostgresNoRewrite(op.from.nativeType, op.to.nativeType)) return null;
    return {
      severity: ctx.sized(op.table, 'caution', true),
      title: `Changing ${qkey(op.table)}.${op.column} from ${op.from.nativeType} to ${op.to.nativeType} rewrites the table`,
      explanation:
        'This type change rewrites every row and rebuilds the table’s indexes under an ACCESS ' +
        'EXCLUSIVE lock, blocking all reads and writes until it finishes. Values that do not ' +
        'convert make it fail part-way.',
      saferAlternative: renderPlan(planExpandContract(op, { dialect: 'postgres' })),
    };
  },
};
