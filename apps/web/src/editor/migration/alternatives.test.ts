import type { Finding, Statement } from '@dashdb/core';
import { describe, expect, it } from 'vitest';
import {
  alternativeSql,
  applyAlternatives,
  findingStatements,
  statementReplacements,
} from './alternatives';

function finding(saferAlternative: string, overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'drop-column',
    severity: 'dangerous',
    operationId: 'op-1',
    title: 'Dropping column orders.note deletes its values',
    explanation: '…',
    saferAlternative,
    docsUrl: '/guides/postgres/drop-column',
    ...overrides,
  };
}

function statement(sql: string, operationId: string, operationIds = [operationId]): Statement {
  return { sql, operationId, operationIds, transactional: true, phase: 'main', destructive: false };
}

describe('alternativeSql', () => {
  it('keeps the steps before a deploy and comments out the rest', () => {
    const sql = alternativeSql(
      finding(
        [
          '1. Add the column as nullable:',
          '   ALTER TABLE t ADD COLUMN c text;',
          '2. Deploy code that writes it, then backfill existing rows in batches.',
          '3. Enforce NOT NULL:',
          '   ALTER TABLE t ALTER COLUMN c SET NOT NULL;',
        ].join('\n'),
        { ruleId: 'add-not-null-without-default', title: 'Adding NOT NULL column' },
      ),
      'sql',
    );
    const lines = sql.split('\n');
    expect(lines[0]).toBe(
      '-- DashDB safer alternative (add-not-null-without-default): Adding NOT NULL column',
    );
    expect(lines).toContain('ALTER TABLE t ADD COLUMN c text;');
    expect(lines).toContain('-- ALTER TABLE t ALTER COLUMN c SET NOT NULL;');
    expect(lines).toContain(
      '-- Not in this migration: run these after deploying application code.',
    );
  });

  it('defers expand/contract plans after the expand phase', () => {
    const sql = alternativeSql(
      finding(
        [
          '1. [expand] Add full_name next to name',
          '   ALTER TABLE users ADD COLUMN full_name text;',
          '2. [migrate] Deploy code that writes both name and full_name',
          '3. [contract] Drop name',
          '   ALTER TABLE users DROP COLUMN name;',
        ].join('\n'),
      ),
      'sql',
    );
    expect(sql).toContain('\nALTER TABLE users ADD COLUMN full_name text;');
    expect(sql).toContain('-- ALTER TABLE users DROP COLUMN name;');
  });

  it('keeps multi-line statements and turns prose into comments', () => {
    const sql = alternativeSql(
      finding(
        [
          '1. Backfill once:',
          '   WITH batch AS (SELECT 1)',
          '   UPDATE t SET c = 1 FROM batch;',
          '   Check the result.',
        ].join('\n'),
      ),
      'sql',
    );
    expect(sql).toContain(
      '\nWITH batch AS (SELECT 1)\nUPDATE t SET c = 1 FROM batch;\n-- Check the result.',
    );
  });

  it('passes plain SQL through and comments out shell commands', () => {
    const sql = alternativeSql(
      finding('-- Run one of these instead:\ngh-ost --alter "..."\npt-online-schema-change ...'),
      'sql',
    );
    expect(sql).toContain(
      '\n-- Run one of these instead:\n-- gh-ost --alter "..."\n-- pt-online-schema-change ...',
    );
    expect(
      alternativeSql(finding('ALTER TABLE t VALIDATE CONSTRAINT c;\n\nNo rows.'), 'sql'),
    ).toContain('\nALTER TABLE t VALIDATE CONSTRAINT c;\n--\n-- No rows.');
  });

  it('comments out CONCURRENTLY for frameworks that run files in a transaction', () => {
    const text = '-- Outside a transaction block.\nCREATE INDEX CONCURRENTLY i ON t (c);';
    expect(alternativeSql(finding(text), 'sql')).toContain(
      '\nCREATE INDEX CONCURRENTLY i ON t (c);',
    );
    const prisma = alternativeSql(finding(text), 'prisma');
    expect(prisma).toContain('-- CREATE INDEX CONCURRENTLY i ON t (c);');
    expect(prisma).toContain('Put this in a migration of its own');
  });
});

describe('applyAlternatives', () => {
  const file =
    'BEGIN;\nALTER TABLE orders DROP COLUMN note;\nALTER TABLE x ADD COLUMN y int;\nCOMMIT;\n';
  const statements = [
    statement('ALTER TABLE orders DROP COLUMN note;', 'op-1'),
    statement('ALTER TABLE x ADD COLUMN y int;', 'op-2'),
  ];

  it('replaces the statement and keeps the original as a comment', () => {
    const result = applyAlternatives(
      file,
      statements,
      [finding('1. Deploy first.\n2. Then drop it later.')],
      'sql',
    );
    expect(result).toContain('-- Replaces:\n-- ALTER TABLE orders DROP COLUMN note;');
    expect(result).not.toMatch(/^ALTER TABLE orders DROP COLUMN note;$/m);
    expect(result).toContain('\nALTER TABLE x ADD COLUMN y int;\n');
  });

  it('comments out further statements of the same operation', () => {
    const two = [...statements, statement('DROP INDEX orders_note_idx;', 'op-1')];
    const result = applyAlternatives(
      `${file}DROP INDEX orders_note_idx;\n`,
      two,
      [finding('Later.')],
      'sql',
    );
    expect(result).toContain('\n-- DROP INDEX orders_note_idx;');
  });

  it('keeps a statement shared with other operations and adds guidance above it', () => {
    const shared = [statement('ALTER TABLE orders DROP COLUMN note;', 'op-1', ['op-1', 'op-3'])];
    const result = applyAlternatives(file, shared, [finding('ALTER TABLE t SET x;')], 'sql');
    expect(result).toContain('-- ALTER TABLE t SET x;\nALTER TABLE orders DROP COLUMN note;');
  });

  it('appends alternatives whose statements are not in the file', () => {
    const result = applyAlternatives('SELECT 1;\n', statements, [finding('Later.')], 'sql');
    expect(result).toMatch(/^SELECT 1;\n\n-- DashDB safer alternative/);
  });

  it('finds the statements of a finding', () => {
    expect(findingStatements(finding(''), statements)).toEqual([statements[0]]);
  });
});

describe('statementReplacements', () => {
  it('mirrors applyAlternatives per statement', () => {
    const views = [
      { key: 'a', statement: statement('ALTER TABLE orders DROP COLUMN note;', 'op-1') },
      { key: 'b', statement: statement('DROP INDEX i;', 'op-1') },
      { key: 'c', statement: statement('ALTER TABLE x MODIFY y int;', 'op-2', ['op-2', 'op-1']) },
      { key: 'd', statement: statement('SELECT 1;', 'op-4') },
    ];
    const map = statementReplacements(views, [finding('Later.')], 'sql');
    expect(map.get('a')).toMatch(
      /^-- DashDB safer alternative[\s\S]*-- Replaces:\n-- ALTER TABLE orders/,
    );
    expect(map.get('b')).toBe('-- DROP INDEX i;');
    expect(map.get('c')).toMatch(/-- Later\.\nALTER TABLE x MODIFY y int;$/);
    expect(map.has('d')).toBe(false);
  });
});
