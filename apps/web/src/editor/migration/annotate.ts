// Human-readable annotations for a generated migration: operation labels, summary counts and
// the per-statement view model.
import type { Finding, Operation, QName, RiskLevel, Statement } from '@dashdb/core';
import type { MigrationOutput } from './compute';

function q(name: QName): string {
  return name.name;
}

/** "Add column users.email", "Rename table people → users", … */
export function describeOperation(op: Operation): string {
  switch (op.kind) {
    case 'createNamespace':
      return `Create schema ${op.name}`;
    case 'dropNamespace':
      return `Drop schema ${op.name}`;
    case 'createEnum':
      return `Create enum ${q(op.enum)}`;
    case 'dropEnum':
      return `Drop enum ${q(op.enum)}`;
    case 'alterEnumAddValue':
      return `Add '${op.value}' to enum ${q(op.enum)}`;
    case 'recreateEnum':
      return `Change values of enum ${q(op.enum)}`;
    case 'createTable':
      return `Create table ${q(op.table)}`;
    case 'dropTable':
      return `Drop table ${q(op.table)}`;
    case 'renameTable':
      return `Rename table ${q(op.from)} → ${op.to.name}`;
    case 'addColumn':
      return `Add column ${q(op.table)}.${op.column.name}`;
    case 'dropColumn':
      return `Drop column ${q(op.table)}.${op.column.name}`;
    case 'renameColumn':
      return `Rename column ${q(op.table)}.${op.from} → ${op.to}`;
    case 'alterColumnType':
      return `Change ${q(op.table)}.${op.column} type ${op.from.nativeType} → ${op.to.nativeType}`;
    case 'alterColumnNullability':
      return `Make ${q(op.table)}.${op.column} ${op.to ? 'nullable' : 'NOT NULL'}`;
    case 'alterColumnDefault':
      return `Change default of ${q(op.table)}.${op.column}`;
    case 'addPrimaryKey':
      return `Add primary key on ${q(op.table)}`;
    case 'dropPrimaryKey':
      return `Drop primary key on ${q(op.table)}`;
    case 'createIndex':
      return `Create index ${op.index.name}`;
    case 'dropIndex':
      return `Drop index ${op.index.name}`;
    case 'addUnique':
      return `Add unique ${op.unique.name}`;
    case 'dropUnique':
      return `Drop unique ${op.unique.name}`;
    case 'addForeignKey':
      return `Add foreign key ${op.foreignKey.name}`;
    case 'dropForeignKey':
      return `Drop foreign key ${op.foreignKey.name}`;
    case 'addCheck':
      return `Add check ${op.check.name}`;
    case 'dropCheck':
      return `Drop check ${op.check.name}`;
    case 'setComment':
      return op.column ? `Comment on ${q(op.table)}.${op.column}` : `Comment on ${q(op.table)}`;
  }
}

export interface MigrationSummary {
  readonly operations: number;
  readonly risk: RiskLevel;
  /** Statements that can delete data. */
  readonly destructive: number;
  /** Operations whose data loss the down migration cannot undo. */
  readonly irreversible: number;
  readonly findings: {
    readonly info: number;
    readonly caution: number;
    readonly dangerous: number;
  };
}

export function summarize(output: MigrationOutput): MigrationSummary {
  const count = (severity: Finding['severity']) =>
    output.report.findings.filter((f) => f.severity === severity).length;
  return {
    operations: output.operations.length,
    risk: output.report.riskLevel,
    destructive: output.statements.filter((s) => s.destructive).length,
    irreversible: output.irreversible,
    findings: { info: count('info'), caution: count('caution'), dangerous: count('dangerous') },
  };
}

export interface StatementView {
  readonly key: string;
  readonly statement: Statement;
  /** Labels of the operations the statement implements. */
  readonly labels: readonly string[];
  /** Safety findings on those operations (up migrations only). */
  readonly findings: readonly Finding[];
}

function operationIndex(id: string): number {
  return Number(id.slice('op-'.length));
}

/** Statements with the operations and findings behind them. */
export function statementViews(
  statements: readonly Statement[],
  operations: readonly Operation[],
  findings: readonly Finding[] = [],
): StatementView[] {
  return statements.map((statement, i) => {
    const ids = statement.operationIds.length ? statement.operationIds : [statement.operationId];
    const labels = [
      ...new Set(
        ids.flatMap((id) => {
          const op = operations[operationIndex(id)];
          return op ? [describeOperation(op)] : [];
        }),
      ),
    ];
    return {
      key: `${String(i)}:${statement.operationId}`,
      statement,
      labels,
      findings: findings.filter((f) => ids.includes(f.operationId)),
    };
  });
}

/** A stable identity for a finding across regenerations (operation indices shift). */
export function findingKey(finding: Finding): string {
  return `${finding.ruleId}|${finding.title}`;
}

/** Highest severity first, then in operation order. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  const rank = { dangerous: 0, caution: 1, info: 2 } as const;
  return [...findings].sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      operationIndex(a.operationId) - operationIndex(b.operationId),
  );
}
