import { qkey } from '../../diff/defs';
import type { Rule } from '../types';
import { numberedSteps, sqlFor } from './shared';

export const dropTable: Rule = {
  id: 'drop-table',
  dialects: ['postgres'],
  check(op, ctx) {
    if (op.kind !== 'dropTable') return null;
    const { table: t, col } = sqlFor(ctx.dialect);
    const parked = `${op.table.name}_dropped`;
    return {
      severity: ctx.sized(op.table, 'dangerous'),
      title: `Dropping table ${qkey(op.table)} deletes all of its rows`,
      explanation:
        'DROP TABLE removes the table and every row in it. The down migration can recreate the ' +
        'structure but not the data, and any running application code that still queries the ' +
        'table starts failing immediately.',
      saferAlternative: numberedSteps([
        'Deploy application code that no longer reads or writes the table.',
        `Rename it instead of dropping it, so it can be restored:\n   ALTER TABLE ${t(op.table)} RENAME TO ${col(parked)};`,
        `After a safe period (and a backup), drop it:\n   DROP TABLE ${t({ namespace: op.table.namespace, name: parked })};`,
      ]),
    };
  },
};
