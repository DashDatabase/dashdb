import { describe, expect, it } from 'vitest';
import { postgresScenario } from '../migrations/__test-utils__/scenarios';
import { analyzeMigration } from './analyze';
import { findingSchema, safetyReportSchema, severitySchema } from './schema';
import type { Finding } from './types';

const finding: Finding = {
  ruleId: 'drop-column',
  severity: 'dangerous',
  operationId: 'op-0',
  title: 'Drops a column',
  explanation: 'Data in the column is lost.',
  saferAlternative: 'Stop reading the column first.',
  docsUrl: '/guides/postgres/drop-column',
};

describe('safety schemas', () => {
  it('accepts a finding and a report', () => {
    expect(findingSchema.parse(finding)).toEqual(finding);
    expect(safetyReportSchema.parse({ riskLevel: 'dangerous', findings: [finding] })).toEqual({
      riskLevel: 'dangerous',
      findings: [finding],
    });
  });

  it('rejects unknown severities, missing fields and extra keys', () => {
    expect(severitySchema.safeParse('fatal').success).toBe(false);
    expect(findingSchema.safeParse({ ...finding, title: '' }).success).toBe(false);
    expect(findingSchema.safeParse({ ...finding, extra: 1 }).success).toBe(false);
    expect(safetyReportSchema.safeParse({ riskLevel: 'risky', findings: [] }).success).toBe(false);
  });

  it('matches what the engine produces', () => {
    const report = analyzeMigration(postgresScenario.diff, 'postgres');
    expect(report.findings.length).toBeGreaterThan(0);
    expect(safetyReportSchema.parse(report)).toEqual(report);
  });
});
