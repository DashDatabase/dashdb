import { describe, expect, it } from 'vitest';
import { mysqlScenario, postgresScenario } from '../migrations/__test-utils__/scenarios';
import { diffOf } from './__test-utils__/analyze';
import { analyzeMigration } from './analyze';
import { rules } from './rules';
import { SafetyError } from './types';

const USERS = 'CREATE TABLE users (id int PRIMARY KEY, email text);';

describe('analyzeMigration', () => {
  it('is safe with no findings, or with info findings only', () => {
    expect(analyzeMigration(diffOf('postgres', USERS, USERS), 'postgres')).toEqual({
      riskLevel: 'safe',
      findings: [],
    });
    const drop = diffOf('postgres', USERS, 'CREATE TABLE users (id int PRIMARY KEY);');
    const empty = analyzeMigration(drop, 'postgres', { tableSizes: { users: 0 } });
    expect(empty.riskLevel).toBe('safe');
    expect(empty.findings.map((f) => f.severity)).toEqual(['info']);
  });

  it('takes the highest severity as the risk level', () => {
    const rename = diffOf(
      'postgres',
      USERS,
      'CREATE TABLE members (id int PRIMARY KEY, email text);',
      ['table:public.users=>public.members'],
    );
    expect(analyzeMigration(rename, 'postgres').riskLevel).toBe('caution');
    expect(analyzeMigration(postgresScenario.diff, 'postgres').riskLevel).toBe('dangerous');
  });

  it('looks table sizes up by schema.table first, then by table name', () => {
    const retype = diffOf('postgres', 'CREATE TABLE s.t (v int);', 'CREATE TABLE s.t (v bigint);');
    const severity = (tableSizes: Record<string, number>, largeTableRows?: number) =>
      analyzeMigration(retype, 'postgres', {
        tableSizes,
        ...(largeTableRows ? { largeTableRows } : {}),
      }).findings[0]?.severity;
    expect(severity({})).toBe('caution');
    expect(severity({ t: 2_000_000 })).toBe('dangerous');
    expect(severity({ 's.t': 10, t: 2_000_000 })).toBe('caution');
    expect(severity({ 's.t': 500 }, 100)).toBe('dangerous');
  });

  it('runs only the rules for the dialect', () => {
    const pgIds = new Set(
      analyzeMigration(postgresScenario.diff, 'postgres').findings.map((f) => f.ruleId),
    );
    const myIds = new Set(
      analyzeMigration(mysqlScenario.diff, 'mysql', {
        tableSizes: { orders: 5_000_000 },
      }).findings.map((f) => f.ruleId),
    );
    const mysqlOnly = rules.filter((r) => !r.dialects.includes('postgres')).map((r) => r.id);
    const postgresOnly = rules.filter((r) => !r.dialects.includes('mysql')).map((r) => r.id);
    expect(mysqlOnly.filter((id) => pgIds.has(id))).toEqual([]);
    expect(postgresOnly.filter((id) => myIds.has(id))).toEqual([]);
    expect([...myIds].sort()).toEqual([
      'alter-table-copy-algorithm',
      'drop-column',
      'large-table-online-change',
      'rename-breaks-app',
    ]);
  });

  it('reports findings in operation order with stable ids and docs links', () => {
    const { findings } = analyzeMigration(postgresScenario.diff, 'postgres');
    const ops = findings.map((f) => Number(f.operationId.slice(3)));
    expect(ops).toEqual([...ops].sort((a, b) => a - b));
    for (const f of findings) {
      expect(f.docsUrl).toBe(`/guides/postgres/${f.ruleId}`);
      expect(postgresScenario.diff.operations[Number(f.operationId.slice(3))]).toBeDefined();
    }
  });

  it('registers each rule once, and every rule has a dialect', () => {
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
    expect(rules).toHaveLength(12);
    for (const r of rules) expect(r.dialects.length).toBeGreaterThan(0);
  });

  it('rejects unsupported dialects', () => {
    expect(() => analyzeMigration(postgresScenario.diff, 'sqlite' as never)).toThrow(SafetyError);
    expect(() => analyzeMigration(postgresScenario.diff, 'sqlite' as never)).toThrow(
      'Safety analysis is not supported for sqlite',
    );
  });
});
