import type { ColumnDef, Operation, QName } from '../diff/types';
import { columnSql as mysqlColumnSql, tableName as mysqlTable } from '../migrations/sql/mysql';
import { tableName as pgTable } from '../migrations/sql/postgres';
import type { MigrationDialect } from '../migrations/types';
import { defaultSql, quoteMysql, quotePostgres } from '../serializers/sql-common';
import { SafetyError } from './types';

export interface ExpandContractStep {
  readonly phase: 'expand' | 'migrate' | 'contract';
  /** `sql` steps run against the database; `app` steps are deploys of application code. */
  readonly kind: 'sql' | 'app';
  readonly title: string;
  readonly sql?: string;
}

export interface ExpandContractPlan {
  readonly operation: Operation['kind'];
  readonly steps: readonly ExpandContractStep[];
}

export interface PlanOptions {
  readonly dialect?: MigrationDialect;
  /** Rows per backfill batch. Default 10,000. */
  readonly batchSize?: number;
}

interface Sql {
  readonly table: (t: QName) => string;
  readonly col: (name: string) => string;
}

const dialects: Record<MigrationDialect, Sql> = {
  postgres: { table: pgTable, col: quotePostgres },
  mysql: { table: mysqlTable, col: quoteMysql },
};

/** Copy `from` into `to` in batches; run repeatedly until it updates no rows. */
function backfill(
  dialect: MigrationDialect,
  table: QName,
  to: string,
  value: string,
  from: string,
  batch: number,
): string {
  const { table: t, col } = dialects[dialect];
  const where = `${col(to)} IS NULL AND ${col(from)} IS NOT NULL`;
  if (dialect === 'mysql') {
    return `-- Repeat until it updates 0 rows:\nUPDATE ${t(table)} SET ${col(to)} = ${value} WHERE ${where} LIMIT ${batch};`;
  }
  return [
    '-- Repeat until it updates 0 rows:',
    `WITH batch AS (SELECT ctid FROM ${t(table)} WHERE ${where} LIMIT ${batch})`,
    `UPDATE ${t(table)} SET ${col(to)} = ${value} FROM batch WHERE ${t(table)}.ctid = batch.ctid;`,
  ].join('\n');
}

/** Re-apply NOT NULL and the default on the new column once it is backfilled. */
function constraints(
  dialect: MigrationDialect,
  table: QName,
  column: string,
  def: ColumnDef | null,
): ExpandContractStep[] {
  if (!def || (def.nullable && def.default === null)) return [];
  const { table: t, col } = dialects[dialect];
  if (dialect === 'mysql') {
    return [
      {
        phase: 'migrate',
        kind: 'sql',
        title: `Restore NOT NULL and the default on ${column}`,
        sql: `ALTER TABLE ${t(table)} MODIFY COLUMN ${mysqlColumnSql({ ...def, name: column })};`,
      },
    ];
  }
  const lines: string[] = [];
  if (def.default !== null && def.default.kind !== 'sequence') {
    lines.push(
      `ALTER TABLE ${t(table)} ALTER COLUMN ${col(column)} SET DEFAULT ${defaultSql(def.default, 'postgres')};`,
    );
  }
  if (!def.nullable) {
    // A validated CHECK lets SET NOT NULL skip its full-table scan (Postgres 12+).
    const check = col(`${column}_not_null`);
    lines.push(
      `ALTER TABLE ${t(table)} ADD CONSTRAINT ${check} CHECK (${col(column)} IS NOT NULL) NOT VALID;`,
      `ALTER TABLE ${t(table)} VALIDATE CONSTRAINT ${check};`,
      `ALTER TABLE ${t(table)} ALTER COLUMN ${col(column)} SET NOT NULL;`,
      `ALTER TABLE ${t(table)} DROP CONSTRAINT ${check};`,
    );
  }
  return lines.length
    ? [
        {
          phase: 'migrate',
          kind: 'sql',
          title: `Restore NOT NULL and the default on ${column}`,
          sql: lines.join('\n'),
        },
      ]
    : [];
}

/**
 * A zero-downtime alternative to a rename or a column type change: add the new shape next to
 * the old one, let the application write both while existing rows are backfilled in batches,
 * move reads over, and only then remove the old shape.
 */
export function planExpandContract(
  operation: Operation,
  options: PlanOptions = {},
): ExpandContractPlan {
  const dialect = options.dialect ?? 'postgres';
  const batch = options.batchSize ?? 10_000;
  const { table: t, col } = dialects[dialect];

  switch (operation.kind) {
    case 'renameColumn': {
      const { table, from, to } = operation;
      const def = operation.definition?.after ?? null;
      const type = def?.nativeType ?? '<type>';
      return {
        operation: operation.kind,
        steps: [
          {
            phase: 'expand',
            kind: 'sql',
            title: `Add ${to} next to ${from}${def ? '' : ' (replace <type> with the column type)'}`,
            sql: `ALTER TABLE ${t(table)} ADD COLUMN ${col(to)} ${type};`,
          },
          {
            phase: 'migrate',
            kind: 'app',
            title: `Deploy code that writes both ${from} and ${to} on every insert and update`,
          },
          {
            phase: 'migrate',
            kind: 'sql',
            title: `Backfill ${to} from ${from} in batches`,
            sql: backfill(dialect, table, to, col(from), from, batch),
          },
          ...constraints(dialect, table, to, def),
          {
            phase: 'migrate',
            kind: 'app',
            title: `Deploy code that reads ${to} instead of ${from}`,
          },
          { phase: 'migrate', kind: 'app', title: `Deploy code that no longer writes ${from}` },
          {
            phase: 'contract',
            kind: 'sql',
            title: `Drop ${from}`,
            sql: `ALTER TABLE ${t(table)} DROP COLUMN ${col(from)};`,
          },
        ],
      };
    }
    case 'alterColumnType': {
      const { table, column } = operation;
      const target = `${column}_new`;
      const type = operation.to.nativeType;
      const enumInvolved =
        operation.from.logicalType.kind === 'enum' || operation.to.logicalType.kind === 'enum';
      const value =
        dialect === 'postgres'
          ? `${col(column)}::${enumInvolved ? 'text::' : ''}${type}`
          : col(column);
      return {
        operation: operation.kind,
        steps: [
          {
            phase: 'expand',
            kind: 'sql',
            title: `Add ${target} with type ${type}`,
            sql: `ALTER TABLE ${t(table)} ADD COLUMN ${col(target)} ${type};`,
          },
          {
            phase: 'migrate',
            kind: 'app',
            title: `Deploy code that writes both ${column} and ${target} (converted) on every write`,
          },
          {
            phase: 'migrate',
            kind: 'sql',
            title: `Backfill ${target} from ${column} in batches`,
            sql: backfill(dialect, table, target, value, column, batch),
          },
          ...constraints(dialect, table, target, operation.definition.after),
          {
            phase: 'migrate',
            kind: 'app',
            title: `Deploy code that reads ${target} instead of ${column}`,
          },
          {
            phase: 'contract',
            kind: 'sql',
            title: `Drop the old ${column}`,
            sql: `ALTER TABLE ${t(table)} DROP COLUMN ${col(column)};`,
          },
          {
            phase: 'contract',
            kind: 'sql',
            title: `Optionally rename ${target} back to ${column}: this is itself a breaking rename, so keep ${target} or repeat the read switch`,
            sql: `ALTER TABLE ${t(table)} RENAME COLUMN ${col(target)} TO ${col(column)};`,
          },
        ],
      };
    }
    case 'renameTable': {
      const { from, to } = operation;
      const rename =
        dialect === 'postgres'
          ? from.namespace === to.namespace
            ? `ALTER TABLE ${t(from)} RENAME TO ${col(to.name)};`
            : `ALTER TABLE ${t(from)} SET SCHEMA ${col(to.namespace)};\nALTER TABLE ${t({ namespace: to.namespace, name: from.name })} RENAME TO ${col(to.name)};`
          : `RENAME TABLE ${t(from)} TO ${t(to)};`;
      return {
        operation: operation.kind,
        steps: [
          {
            phase: 'expand',
            kind: 'sql',
            title: `Rename ${from.name} to ${to.name} and keep the old name working through a view`,
            sql: `${rename}\nCREATE VIEW ${t(from)} AS SELECT * FROM ${t(to)};`,
          },
          { phase: 'migrate', kind: 'app', title: `Deploy code that uses ${to.name}` },
          {
            phase: 'contract',
            kind: 'sql',
            title: `Drop the compatibility view`,
            sql: `DROP VIEW ${t(from)};`,
          },
        ],
      };
    }
    default:
      throw new SafetyError(
        `No expand/contract plan for ${operation.kind}; it applies to renames and type changes`,
      );
  }
}

/** The plan as numbered text, for a finding's saferAlternative. */
export function renderPlan(plan: ExpandContractPlan): string {
  return plan.steps
    .map((step, i) => {
      const head = `${i + 1}. [${step.phase}] ${step.title}`;
      return step.sql
        ? `${head}\n${step.sql
            .split('\n')
            .map((l) => `   ${l}`)
            .join('\n')}`
        : head;
    })
    .join('\n');
}
