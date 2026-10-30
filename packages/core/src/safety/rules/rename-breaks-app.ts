import { qkey } from '../../diff/defs';
import { isTempColumn, isTempTable } from '../../diff/order';
import type { Operation } from '../../diff/types';
import { planExpandContract, renderPlan } from '../expand-contract';
import type { Rule } from '../types';

type Rename = Extract<Operation, { kind: 'renameTable' | 'renameColumn' }>;

/**
 * A swap runs `a → tmp, b → a, tmp → b`. Report `a → b` on the first step (resolving the
 * temporary name through the later step) and skip the last one.
 */
function realRename(op: Rename, operations: readonly Operation[]): Rename | null {
  if (op.kind === 'renameTable') {
    if (isTempTable(op.from)) return null;
    if (!isTempTable(op.to)) return op;
    const next = operations.find(
      (o) => o.kind === 'renameTable' && qkey(o.from) === qkey(op.to),
    ) as Rename;
    return { ...op, to: (next as typeof op).to };
  }
  if (isTempColumn(op.from)) return null;
  if (!isTempColumn(op.to)) return op;
  const next = operations.find(
    (o) => o.kind === 'renameColumn' && qkey(o.table) === qkey(op.table) && o.from === op.to,
  ) as typeof op;
  return { ...op, to: next.to };
}

export const renameBreaksApp: Rule = {
  id: 'rename-breaks-app',
  dialects: ['postgres', 'mysql'],
  check(op, ctx) {
    if (op.kind !== 'renameTable' && op.kind !== 'renameColumn') return null;
    const rename = realRename(op, ctx.operations);
    if (!rename) return null;
    const title =
      rename.kind === 'renameTable'
        ? `Renaming table ${qkey(rename.from)} to ${rename.to.name} breaks code that uses the old name`
        : `Renaming column ${qkey(rename.table)}.${rename.from} to ${rename.to} breaks code that uses the old name`;
    return {
      severity: 'caution',
      title,
      explanation:
        'The rename is instant, but application instances still running the previous release ' +
        'keep using the old name and fail until they are replaced. Deploys are never atomic ' +
        'with migrations, so some requests will error.',
      saferAlternative: renderPlan(planExpandContract(rename, { dialect: ctx.dialect })),
    };
  },
};
