import { my, pg } from '../../diff/__test-utils__/harness';
import { diffSchemas } from '../../diff/diff';
import type { DiffResult } from '../../diff/types';
import type { MigrationDialect } from '../../migrations/types';
import { analyzeMigration } from '../analyze';
import type { AnalyzeOptions, Finding } from '../types';

export function diffOf(
  dialect: MigrationDialect,
  before: string,
  after: string,
  confirmedRenames: string[] = [],
): DiffResult {
  const parse = dialect === 'postgres' ? pg : my;
  return diffSchemas(parse(before), parse(after), { confirmedRenames });
}

/** Findings of one rule for a DDL change. */
export function findings(
  ruleId: string,
  dialect: MigrationDialect,
  before: string,
  after: string,
  options: AnalyzeOptions & { renames?: string[] } = {},
): Finding[] {
  const diff = diffOf(dialect, before, after, options.renames);
  return analyzeMigration(diff, dialect, options).findings.filter((f) => f.ruleId === ruleId);
}
