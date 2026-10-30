import { qkey } from '../../diff/defs';
import type { Rule } from '../types';
import { sqlFor } from './shared';

export const addFkValidating: Rule = {
  id: 'add-fk-validating',
  dialects: ['postgres'],
  check(op, ctx) {
    if (op.kind !== 'addForeignKey' || ctx.isNewTable(op.table)) return null;
    const { table: t, col } = sqlFor(ctx.dialect);
    const fk = op.foreignKey;
    const cols = (names: readonly string[]) => names.map(col).join(', ');
    const name = col(fk.name);
    return {
      severity: ctx.sized(op.table, 'caution', true),
      title: `Adding foreign key ${fk.name} scans ${qkey(op.table)} while blocking writes`,
      explanation:
        'ADD FOREIGN KEY checks every existing row while holding a SHARE ROW EXCLUSIVE lock on ' +
        `both ${qkey(op.table)} and ${qkey(fk.refTable)}, so writes to both wait for the full scan.`,
      saferAlternative:
        `ALTER TABLE ${t(op.table)} ADD CONSTRAINT ${name} FOREIGN KEY (${cols(fk.columns)}) ` +
        `REFERENCES ${t(fk.refTable)} (${cols(fk.refColumns)}) NOT VALID;\n` +
        '-- In a separate transaction; it only takes a SHARE UPDATE EXCLUSIVE lock:\n' +
        `ALTER TABLE ${t(op.table)} VALIDATE CONSTRAINT ${name};`,
    };
  },
};
