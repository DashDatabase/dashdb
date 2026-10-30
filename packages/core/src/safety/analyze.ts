import { qkey } from '../diff/defs';
import type { DiffResult, QName } from '../diff/types';
import type { MigrationDialect } from '../migrations/types';
import { rules } from './rules';
import {
  SafetyError,
  type AnalyzeOptions,
  type Finding,
  type RiskLevel,
  type RuleContext,
  type SafetyReport,
  type Severity,
} from './types';

const SUPPORTED: readonly string[] = ['postgres', 'mysql'];
const RANK: Record<Severity, number> = { info: 0, caution: 1, dangerous: 2 };

/**
 * Checks a diff's operations against the safety rules for a dialect. `riskLevel` is the
 * highest finding severity; `info` findings (e.g. on empty tables) leave a migration `safe`.
 */
export function analyzeMigration(
  diff: DiffResult,
  dialect: MigrationDialect,
  options: AnalyzeOptions = {},
): SafetyReport {
  if (!SUPPORTED.includes(dialect)) {
    throw new SafetyError(`Safety analysis is not supported for ${dialect}`);
  }
  const sizes = new Map(Object.entries(options.tableSizes ?? {}));
  const largeRows = options.largeTableRows ?? 1_000_000;
  const created = new Set(
    diff.operations.flatMap((op) => (op.kind === 'createTable' ? [qkey(op.table)] : [])),
  );
  const rows = (t: QName) => sizes.get(qkey(t)) ?? sizes.get(t.name);
  const isNewTable = (t: QName) => created.has(qkey(t));
  const isLarge = (t: QName) => (rows(t) ?? 0) >= largeRows;
  const ctx: RuleContext = {
    dialect,
    operations: diff.operations,
    concurrentIndexes: options.concurrentIndexes !== false,
    rows,
    isNewTable,
    isLarge,
    sized: (t, base, scalesWithSize = false) => {
      if (isNewTable(t) || rows(t) === 0) return 'info';
      return scalesWithSize && isLarge(t) ? 'dangerous' : base;
    },
  };

  const active = rules.filter((r) => r.dialects.includes(dialect));
  const findings: Finding[] = [];
  diff.operations.forEach((op, i) => {
    for (const rule of active) {
      const found = rule.check(op, ctx);
      if (found) {
        findings.push({
          ruleId: rule.id,
          operationId: `op-${i}`,
          docsUrl: `/guides/${dialect}/${rule.id}`,
          ...found,
        });
      }
    }
  });

  const top = Math.max(0, ...findings.map((f) => RANK[f.severity]));
  const riskLevel: RiskLevel = top === 2 ? 'dangerous' : top === 1 ? 'caution' : 'safe';
  return { riskLevel, findings };
}
