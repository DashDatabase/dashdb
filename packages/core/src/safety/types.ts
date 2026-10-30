import type { Operation, QName } from '../diff/types';
import type { MigrationDialect } from '../migrations/types';

export type Severity = 'info' | 'caution' | 'dangerous';
export type RiskLevel = 'safe' | 'caution' | 'dangerous';

export interface Finding {
  readonly ruleId: string;
  readonly severity: Severity;
  /** `op-<n>`: the operation's index in `diff.operations` (as in generated Statements). */
  readonly operationId: string;
  readonly title: string;
  readonly explanation: string;
  /** SQL or numbered steps that achieve the same change with less risk. */
  readonly saferAlternative: string;
  /** `/guides/<dialect>/<rule-id>`. */
  readonly docsUrl: string;
}

export interface SafetyReport {
  readonly riskLevel: RiskLevel;
  readonly findings: readonly Finding[];
}

export interface AnalyzeOptions {
  /** Row counts, keyed `schema.table` or `table`; they raise or lower severities. */
  readonly tableSizes?: Readonly<Record<string, number>>;
  /** Tables with at least this many rows count as large. Default 1,000,000. */
  readonly largeTableRows?: number;
  /** Whether the migration builds non-unique indexes CONCURRENTLY (as generateSQL does). Default true. */
  readonly concurrentIndexes?: boolean;
}

export interface RuleContext {
  readonly dialect: MigrationDialect;
  readonly operations: readonly Operation[];
  readonly concurrentIndexes: boolean;
  /** Known row count, or undefined. */
  rows(table: QName): number | undefined;
  /** Whether the table is created by this same migration (so it is empty). */
  isNewTable(table: QName): boolean;
  /**
   * The rule's base severity adjusted for the table's size: `info` when empty, `dangerous`
   * when at least `largeTableRows` (if the rule scales with size), the base otherwise.
   */
  sized(table: QName, base: Severity, scalesWithSize?: boolean): Severity;
  /** Whether the table is known to have at least `largeTableRows` rows. */
  isLarge(table: QName): boolean;
}

export type RuleFinding = Pick<Finding, 'severity' | 'title' | 'explanation' | 'saferAlternative'>;

/** One safety rule. Rules are small modules listed in `rules/index.ts`. */
export interface Rule {
  readonly id: string;
  readonly dialects: readonly MigrationDialect[];
  check(op: Operation, ctx: RuleContext): RuleFinding | null;
}

export class SafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafetyError';
  }
}
