import type { Column, SchemaProblem } from '@dashdb/core';
import { describe, expect, it } from 'vitest';
import { describeDefault, problemTableId, relativeTime } from './schema-text';

const column = (value: Column['default']): Column => ({
  id: 'c',
  name: 'c',
  logicalType: { kind: 'text' },
  nativeType: 'text',
  nullable: true,
  default: value,
  autoIncrement: false,
  comment: null,
  metadata: {},
});

describe('describeDefault', () => {
  it('renders each default kind as SQL', () => {
    expect(describeDefault(column(null))).toBe('');
    expect(describeDefault(column({ kind: 'expression', sql: 'now()' }))).toBe('now()');
    expect(describeDefault(column({ kind: 'sequence', name: 'users_id_seq' }))).toBe(
      "nextval('users_id_seq')",
    );
    expect(describeDefault(column({ kind: 'literal', value: "it's" }))).toBe("'it''s'");
    expect(describeDefault(column({ kind: 'literal', value: 42 }))).toBe('42');
    expect(describeDefault(column({ kind: 'literal', value: false }))).toBe('false');
    expect(describeDefault(column({ kind: 'literal', value: null }))).toBe('NULL');
  });
});

describe('problemTableId', () => {
  it('returns the table for table-scoped problems only', () => {
    const tableProblem: SchemaProblem = {
      code: 'duplicate-table-name',
      tableId: 't1',
      name: 'users',
      message: 'dup',
      path: [],
    };
    const shapeProblem: SchemaProblem = { code: 'invalid-shape', message: 'bad', path: [] };
    expect(problemTableId(tableProblem)).toBe('t1');
    expect(problemTableId(shapeProblem)).toBeNull();
  });
});

describe('relativeTime', () => {
  const now = Date.UTC(2026, 9, 30, 12);
  it('formats past times in the largest whole unit', () => {
    expect(relativeTime(now - 10_000, now)).toBe('just now');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(relativeTime(now - 26 * 3600_000, now)).toBe('yesterday');
    expect(relativeTime(now - 400 * 24 * 3600_000, now)).toBe('last year');
  });
});
