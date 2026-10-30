import { qkey } from '../diff/defs';
import { invertOperations } from '../diff/invert';
import type { DiffResult, Operation } from '../diff/types';
import { header } from './header';
import { mysqlStatements } from './sql/mysql';
import { postgresStatements } from './sql/postgres';
import {
  MigrationError,
  type MigrationDialect,
  type SqlMigration,
  type SqlOptions,
  type Statement,
} from './types';

const operationId = (i: number) => `op-${i}`;

/** Operations whose data the down migration cannot bring back. */
export function irreversibleReason(op: Operation): string | null {
  switch (op.kind) {
    case 'dropTable':
      return `dropping table ${qkey(op.table)} deletes its rows; the down migration recreates it empty`;
    case 'dropColumn':
      return `dropping column ${qkey(op.table)}.${op.column.name} deletes its values; the down migration recreates it empty`;
    case 'recreateEnum': {
      const removed = op.from.filter((v) => !op.to.includes(v));
      return removed.length
        ? `enum ${qkey(op.enum)} loses ${removed.join(', ')}; rows holding them fail to convert or must be changed first`
        : null;
    }
    default:
      return null;
  }
}

/** Down operations that undo an irreversible up operation (they restore structure, not data). */
function restoresLostData(up: readonly Operation[]): (op: Operation) => string | null {
  const tables = new Set<string>();
  const columns = new Set<string>();
  const enums = new Set<string>();
  for (const op of up) {
    if (irreversibleReason(op) === null) continue;
    if (op.kind === 'dropTable') tables.add(qkey(op.table));
    if (op.kind === 'dropColumn') columns.add(`${qkey(op.table)}.${op.column.name}`);
    if (op.kind === 'recreateEnum') enums.add(qkey(op.enum));
  }
  return (op) => {
    if (op.kind === 'createTable' && tables.has(qkey(op.table))) {
      return `restores the structure of ${qkey(op.table)} only; the rows deleted by the up migration cannot be restored`;
    }
    if (op.kind === 'addColumn' && columns.has(`${qkey(op.table)}.${op.column.name}`)) {
      return `restores column ${qkey(op.table)}.${op.column.name} only; its values cannot be restored`;
    }
    if (op.kind === 'recreateEnum' && enums.has(qkey(op.enum))) {
      return `restores the values of ${qkey(op.enum)}; rows converted by the up migration keep their new values`;
    }
    return null;
  };
}

/**
 * Statements and file body for one direction. `embedded` is for framework runners (Prisma,
 * Drizzle) that execute a migration file inside their own transaction: no BEGIN/COMMIT, and no
 * statements that cannot run inside a transaction.
 */
export function renderStatements(
  ops: readonly Operation[],
  dialect: MigrationDialect,
  options: { concurrent: boolean; embedded: boolean },
  note: (op: Operation) => string | null,
): Statement[] {
  const statements: Statement[] = [];
  if (dialect === 'postgres') {
    const transient = new Set(
      ops.flatMap((op) =>
        op.kind === 'createTable' || op.kind === 'dropTable' ? [qkey(op.table)] : [],
      ),
    );
    const defaultChanges = new Set(
      ops.flatMap((op) =>
        op.kind === 'alterColumnDefault' ? [`${qkey(op.table)}.${op.column}`] : [],
      ),
    );
    const ctx = {
      concurrent: options.concurrent,
      transient,
      embedded: options.embedded,
      defaultChanges,
    };
    ops.forEach((op, i) => {
      postgresStatements(op, ctx).forEach((b, j) => {
        const lost = j === 0 ? note(op) : null;
        const comment = lost ? `IRREVERSIBLE: ${lost}` : b.comment;
        statements.push({
          sql: b.sql,
          operationId: operationId(i),
          operationIds: [operationId(i)],
          transactional: b.phase === 'transaction',
          phase: b.phase === 'transaction' ? 'main' : b.phase,
          destructive: b.destructive === true,
          ...(comment ? { comment } : {}),
        });
      });
    });
  } else {
    // Note each lost-data operation once, on the first statement that implements it.
    const noted = new Set<number>();
    for (const b of mysqlStatements(ops)) {
      const first = b.operations[0] as number;
      const lostAt = b.operations.find((i) => !noted.has(i) && note(ops[i] as Operation) !== null);
      if (lostAt !== undefined) noted.add(lostAt);
      const lost = lostAt === undefined ? null : note(ops[lostAt] as Operation);
      statements.push({
        sql: b.sql,
        operationId: operationId(first),
        operationIds: b.operations.map(operationId),
        transactional: false,
        phase: 'main',
        destructive: b.destructive === true,
        ...(lost ? { comment: `IRREVERSIBLE: ${lost}` } : {}),
      });
    }
  }
  return statements;
}

const withComment = (s: Statement) => (s.comment ? `-- ${s.comment}\n${s.sql}` : s.sql);

function renderFile(
  dialect: MigrationDialect,
  statements: readonly Statement[],
  embedded: boolean,
): string {
  if (!statements.length) return '-- No changes.';
  if (dialect === 'mysql' || embedded) return statements.map(withComment).join('\n\n');
  const of = (phase: Statement['phase']) => statements.filter((s) => s.phase === phase);
  const before = of('before');
  const inside = of('main');
  const after = of('after');
  const blocks: string[] = [];
  if (before.length) {
    blocks.push(
      `-- Outside the transaction, before it:\n\n${before.map(withComment).join('\n\n')}`,
    );
  }
  if (inside.length) blocks.push(['BEGIN;', ...inside.map(withComment), 'COMMIT;'].join('\n\n'));
  if (after.length)
    blocks.push(`-- Outside the transaction, after it:\n\n${after.map(withComment).join('\n\n')}`);
  return blocks.join('\n\n');
}

const DIALECT_NOTES: Record<MigrationDialect, (embedded: boolean) => string[]> = {
  postgres: (embedded) =>
    embedded
      ? [
          "Runs inside the migration tool's transaction: no CONCURRENTLY, and enum values added here",
          'cannot be used until the migration has committed.',
        ]
      : [
          'Postgres runs DDL transactionally: everything between BEGIN and COMMIT applies atomically.',
        ],
  mysql: () => [
    'MySQL has no transactional DDL: every statement commits on its own, so a failure part-way',
    'leaves the earlier statements applied. Take a backup before running it.',
  ],
};

export interface GeneratedSql extends SqlMigration {
  /** File bodies without the header, for embedding in framework migration files. */
  readonly bodies: { readonly up: string; readonly down: string };
}

/** Shared by generateSQL and the framework generators. */
export function buildSql(
  diff: DiffResult,
  dialect: string,
  options: SqlOptions & { embedded?: boolean },
): GeneratedSql {
  if (dialect !== 'postgres' && dialect !== 'mysql') {
    throw new MigrationError(`SQL migrations are not supported for ${dialect}`);
  }
  const embedded = options.embedded === true;
  const concurrent = !embedded && options.concurrentIndexes !== false;
  const now = options.now ?? new Date();
  const up = diff.operations;
  const down = invertOperations(up);
  const irreversible = up.filter((op) => irreversibleReason(op) !== null).length;

  const upRendered = renderStatements(up, dialect, { concurrent, embedded }, irreversibleReason);
  const downRendered = renderStatements(
    down,
    dialect,
    { concurrent, embedded },
    restoresLostData(up),
  );
  const upBody = renderFile(dialect, upRendered, embedded);
  const downBody = renderFile(dialect, downRendered, embedded);

  const head = (ops: readonly Operation[], direction: string) =>
    header('--', {
      now,
      operations: ops,
      warnings: diff.warnings.length,
      irreversible,
      notes: [`Direction: ${direction}. Dialect: ${dialect}.`, ...DIALECT_NOTES[dialect](embedded)],
    });
  return {
    up: `${head(up, 'up')}\n\n${upBody}\n`,
    down: `${head(down, 'down')}\n\n${downBody}\n`,
    bodies: { up: upBody, down: downBody },
    statements: upRendered,
    downStatements: downRendered,
    downOperations: down,
    irreversible,
    warnings: diff.warnings,
  };
}

/**
 * Up and down SQL for a diff. Postgres migrations run in one transaction, except statements
 * Postgres refuses inside one (CREATE/DROP INDEX CONCURRENTLY, ALTER TYPE … ADD VALUE),
 * which are emitted before or after it with a comment. MySQL DDL is not transactional; the
 * header says so. Irreversible operations are flagged in both files and counted.
 */
export function generateSQL(
  diff: DiffResult,
  dialect: MigrationDialect,
  options: SqlOptions = {},
): SqlMigration {
  const m = buildSql(diff, dialect, options);
  return {
    up: m.up,
    down: m.down,
    statements: m.statements,
    downStatements: m.downStatements,
    downOperations: m.downOperations,
    irreversible: m.irreversible,
    warnings: m.warnings,
  };
}
