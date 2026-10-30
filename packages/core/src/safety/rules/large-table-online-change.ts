import { qkey } from '../../diff/defs';
import type { Operation, QName } from '../../diff/types';
import { mysqlStatements, tableName } from '../../migrations/sql/mysql';
import type { Rule } from '../types';
import { tablesOf } from './shared';

const REBUILDS = new Set<Operation['kind']>([
  'alterColumnType',
  'alterColumnNullability',
  'addPrimaryKey',
  'dropPrimaryKey',
  'addForeignKey',
  'recreateEnum',
]);

/** The ALTER TABLE clause for one table, as gh-ost and pt-osc take it. */
export function alterClause(op: Operation, table: QName): string {
  const statement = mysqlStatements([op])
    .map((s) => /^ALTER TABLE (\S+) ([\s\S]*);$/.exec(s.sql))
    .find((m) => m?.[1] === tableName(table));
  return statement?.[2] ?? '<alter clause>';
}

export const largeTableOnlineChange: Rule = {
  id: 'large-table-online-change',
  dialects: ['mysql'],
  check(op, ctx) {
    if (!REBUILDS.has(op.kind)) return null;
    const large = tablesOf(op).filter((t) => ctx.isLarge(t));
    if (!large.length) return null;
    const commands = large.flatMap((t) => {
      // Single-quoted for the shell: backticks and $ stay literal; embedded quotes are closed and escaped.
      const clause = `'${alterClause(op, t).replace(/'/g, "'\\''")}'`;
      const db = t.namespace === 'default' ? '<database>' : t.namespace;
      return [
        `gh-ost --host=<host> --user=<user> --database=${db} --table=${t.name} --alter=${clause} --execute`,
        `pt-online-schema-change --alter ${clause} D=${db},t=${t.name} --execute`,
      ];
    });
    return {
      severity: 'dangerous',
      title: `Rebuilding large table ${large.map(qkey).join(', ')} in place risks a long outage`,
      explanation:
        `${large.map((t) => `${qkey(t)} has ${String(ctx.rows(t))} rows`).join('; ')}. ` +
        'Even an online ALTER holds a metadata lock at start and end, replays the change log, ' +
        'and lags replicas for the whole rebuild. An online schema-change tool copies in small ' +
        'chunks, throttles on replica lag and can be paused or aborted.',
      saferAlternative: `-- Run one of these instead of the migration statement (try with --dry-run first):\n${commands.join('\n')}`,
    };
  },
};
