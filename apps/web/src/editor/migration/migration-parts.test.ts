import {
  addColumn,
  addTable,
  removeColumn,
  removeTable,
  renameTable,
  updateColumn,
  type Finding,
  type Operation,
  type Statement,
} from '@dashdb/core';
import { describe, expect, it } from 'vitest';
import { columnId, shopSchema, table } from '../canvas/test-schema';
import { describeOperation, findingKey, sortFindings, statementViews, summarize } from './annotate';
import type { MigrationOutput } from './compute';
import { baseName, migrationSlug, singleFileName } from './files';
import { tokenizeSql } from './sql-tokens';
import { cachedCompare, compareSchemas } from './visual-diff';

describe('migrationSlug', () => {
  it('turns any name into snake_case', () => {
    expect(migrationSlug('Add user e-mail!')).toBe('add_user_e_mail');
    expect(migrationSlug('  Café crème  ')).toBe('cafe_creme');
    expect(migrationSlug('!!!')).toBe('migration');
    expect(migrationSlug(`${'a'.repeat(59)} b`)).toBe('a'.repeat(59));
  });

  it('takes the last path segment', () => {
    expect(baseName('prisma/migrations/x/migration.sql')).toBe('migration.sql');
    expect(baseName('up.sql')).toBe('up.sql');
    expect(singleFileName('migrations/20261031_x/up.sql')).toBe('20261031_x.up.sql');
    expect(singleFileName('prisma/migrations/20261031_x/migration.sql')).toBe(
      '20261031_x.migration.sql',
    );
    expect(singleFileName('drizzle/0000_x.sql')).toBe('0000_x.sql');
    expect(singleFileName('up.sql')).toBe('up.sql');
  });
});

describe('tokenizeSql', () => {
  it('classifies keywords, types, strings, identifiers and comments', () => {
    const tokens = tokenizeSql(
      `-- note\nALTER TABLE "users" ADD COLUMN age int DEFAULT 'x''y' + 12;`,
    );
    const kinds = tokens.filter((t) => t.text.trim()).map((t) => [t.kind, t.text.trim()]);
    expect(kinds).toEqual([
      ['comment', '-- note'],
      ['keyword', 'ALTER'],
      ['keyword', 'TABLE'],
      ['identifier', '"users"'],
      ['keyword', 'ADD'],
      ['keyword', 'COLUMN'],
      ['plain', 'age'],
      ['type', 'int'],
      ['keyword', 'DEFAULT'],
      ['string', "'x''y'"],
      ['plain', '+'],
      ['number', '12'],
      ['punctuation', ';'],
    ]);
    expect(tokens.map((t) => t.text).join('')).toBe(
      `-- note\nALTER TABLE "users" ADD COLUMN age int DEFAULT 'x''y' + 12;`,
    );
  });

  it('handles block comments, backticks and unterminated text', () => {
    expect(tokenizeSql("/* a */ `t` 'open").map((t) => t.kind)).toEqual([
      'comment',
      'plain',
      'identifier',
      'plain',
      'string',
    ]);
  });
});

describe('describeOperation', () => {
  const t = { namespace: 'public', name: 'users' };
  const column = {
    name: 'email',
    nativeType: 'text',
    logicalType: { kind: 'text' },
    nullable: true,
    default: null,
    autoIncrement: false,
    comment: null,
    metadata: {},
  } as const;
  const defs = { before: column, after: column };
  const key = { name: 'k', columns: ['email'] };
  const index = { name: 'users_email_idx', columns: [], unique: false, method: null, where: null };
  const fk = {
    name: 'fk',
    columns: ['a'],
    refTable: t,
    refColumns: ['id'],
    onDelete: 'no action',
    onUpdate: 'no action',
  } as const;
  const tableDef = {
    ...t,
    columns: [],
    primaryKey: null,
    uniques: [],
    checks: [],
    indexes: [],
    comment: null,
    metadata: {},
  };
  const state = { default: null, autoIncrement: false, identity: null };
  const cases: [Operation, string][] = [
    [{ kind: 'createNamespace', name: 'app' }, 'Create schema app'],
    [{ kind: 'dropNamespace', name: 'app' }, 'Drop schema app'],
    [{ kind: 'createEnum', enum: { ...t, values: [] } }, 'Create enum users'],
    [{ kind: 'dropEnum', enum: { ...t, values: [] } }, 'Drop enum users'],
    [
      {
        kind: 'alterEnumAddValue',
        enum: t,
        value: 'x',
        before: null,
        from: [],
        to: [],
        columns: [],
      },
      "Add 'x' to enum users",
    ],
    [
      { kind: 'recreateEnum', enum: t, from: [], to: [], columns: [] },
      'Change values of enum users',
    ],
    [{ kind: 'createTable', table: tableDef }, 'Create table users'],
    [{ kind: 'dropTable', table: tableDef }, 'Drop table users'],
    [{ kind: 'renameTable', from: t, to: { ...t, name: 'people' } }, 'Rename table users → people'],
    [{ kind: 'addColumn', table: t, column }, 'Add column users.email'],
    [{ kind: 'dropColumn', table: t, column }, 'Drop column users.email'],
    [{ kind: 'renameColumn', table: t, from: 'a', to: 'b' }, 'Rename column users.a → b'],
    [
      {
        kind: 'alterColumnType',
        table: t,
        column: 'email',
        from: { nativeType: 'text', logicalType: { kind: 'text' } },
        to: { nativeType: 'int', logicalType: { kind: 'int' } },
        definition: defs,
      },
      'Change users.email type text → int',
    ],
    [
      {
        kind: 'alterColumnNullability',
        table: t,
        column: 'email',
        from: true,
        to: false,
        definition: defs,
      },
      'Make users.email NOT NULL',
    ],
    [
      {
        kind: 'alterColumnNullability',
        table: t,
        column: 'email',
        from: false,
        to: true,
        definition: defs,
      },
      'Make users.email nullable',
    ],
    [
      {
        kind: 'alterColumnDefault',
        table: t,
        column: 'email',
        from: state,
        to: state,
        definition: defs,
      },
      'Change default of users.email',
    ],
    [{ kind: 'addPrimaryKey', table: t, primaryKey: key }, 'Add primary key on users'],
    [{ kind: 'dropPrimaryKey', table: t, primaryKey: key }, 'Drop primary key on users'],
    [{ kind: 'createIndex', table: t, index }, 'Create index users_email_idx'],
    [{ kind: 'dropIndex', table: t, index }, 'Drop index users_email_idx'],
    [{ kind: 'addUnique', table: t, unique: { name: 'u', columns: [] } }, 'Add unique u'],
    [{ kind: 'dropUnique', table: t, unique: { name: 'u', columns: [] } }, 'Drop unique u'],
    [{ kind: 'addForeignKey', table: t, foreignKey: fk }, 'Add foreign key fk'],
    [{ kind: 'dropForeignKey', table: t, foreignKey: fk }, 'Drop foreign key fk'],
    [{ kind: 'addCheck', table: t, check: { name: 'c', expression: '' } }, 'Add check c'],
    [{ kind: 'dropCheck', table: t, check: { name: 'c', expression: '' } }, 'Drop check c'],
    [
      { kind: 'setComment', table: t, column: null, from: null, to: 'x', definition: null },
      'Comment on users',
    ],
    [
      { kind: 'setComment', table: t, column: 'email', from: null, to: 'x', definition: defs },
      'Comment on users.email',
    ],
  ];
  it.each(cases)('describes %o', (op, label) => {
    expect(describeOperation(op)).toBe(label);
  });
});

describe('summaries and statement views', () => {
  const finding = (severity: Finding['severity'], operationId: string): Finding => ({
    ruleId: `rule-${severity}`,
    severity,
    operationId,
    title: `${severity} title`,
    explanation: '',
    saferAlternative: '',
    docsUrl: '',
  });
  const statement = (sql: string, ids: string[], destructive = false): Statement => ({
    sql,
    operationId: ids[0] ?? 'op-0',
    operationIds: ids,
    transactional: true,
    phase: 'main',
    destructive,
  });
  const ops: Operation[] = [
    { kind: 'createNamespace', name: 'a' },
    { kind: 'dropNamespace', name: 'b' },
  ];

  it('counts operations, destructive statements and findings', () => {
    const output = {
      operations: ops,
      statements: [statement('x', ['op-0']), statement('y', ['op-1'], true)],
      irreversible: 1,
      report: {
        riskLevel: 'caution',
        findings: [finding('caution', 'op-1'), finding('info', 'op-0')],
      },
    } as unknown as MigrationOutput;
    expect(summarize(output)).toEqual({
      operations: 2,
      risk: 'caution',
      destructive: 1,
      irreversible: 1,
      findings: { info: 1, caution: 1, dangerous: 0 },
    });
  });

  it('labels statements and links their findings', () => {
    const views = statementViews(
      [statement('x', ['op-0', 'op-1']), { ...statement('y', []), operationId: 'op-9' }],
      ops,
      [finding('caution', 'op-1')],
    );
    expect(views[0]?.labels).toEqual(['Create schema a', 'Drop schema b']);
    expect(views[0]?.findings).toHaveLength(1);
    expect(views[1]?.labels).toEqual([]);
    expect(statementViews([statement('x', ['op-0'])], ops)[0]?.findings).toEqual([]);
  });

  it('sorts findings by severity, then operation order, with stable keys', () => {
    const sorted = sortFindings([
      finding('info', 'op-0'),
      finding('dangerous', 'op-3'),
      finding('caution', 'op-1'),
      finding('dangerous', 'op-2'),
    ]);
    expect(sorted.map((f) => `${f.severity}:${f.operationId}`)).toEqual([
      'dangerous:op-2',
      'dangerous:op-3',
      'caution:op-1',
      'info:op-0',
    ]);
    expect(findingKey(finding('info', 'op-0'))).toBe('rule-info|info title');
  });
});

describe('compareSchemas', () => {
  it('marks added, changed and removed tables and columns by id', () => {
    const before = shopSchema();
    const customers = table(before, 'customers').id;
    const orders = table(before, 'orders').id;
    let after = addColumn(before, customers, {
      name: 'phone',
      logicalType: { kind: 'text' },
      nativeType: 'text',
    });
    after = updateColumn(after, customers, columnId(before, 'customers', 'name'), {
      nullable: false,
    });
    after = removeColumn(after, orders, columnId(before, 'orders', 'note'));
    after = removeTable(after, table(before, 'coupons').id);
    after = addTable(after, {
      name: 'audit',
      namespace: before.namespaces[0]?.id ?? '',
      columns: [],
    });

    const diff = compareSchemas(before, after);
    const phone = table(after, 'customers').columns.find((c) => c.name === 'phone')?.id ?? '';
    expect(diff.tables.get(customers)?.kind).toBe('changed');
    expect(diff.tables.get(customers)?.columns.get(phone)).toBe('added');
    expect(diff.tables.get(customers)?.columns.get(columnId(before, 'customers', 'name'))).toBe(
      'changed',
    );
    expect(diff.tables.get(orders)).toMatchObject({ kind: 'changed', removedColumns: ['note'] });
    expect(diff.tables.get(table(after, 'audit').id)?.kind).toBe('added');
    // orders lost its FK to coupons, so it changed; profiles is untouched.
    expect(diff.tables.has(table(after, 'profiles').id)).toBe(false);
    expect(diff.removedTables.map((t) => t.name)).toEqual(['coupons']);
  });

  it('counts a rename as a change and ignores unchanged copies', () => {
    const before = shopSchema();
    const copy = structuredClone(before);
    expect(compareSchemas(before, copy).tables.size).toBe(0);
    const renamed = renameTable(before, table(before, 'profiles').id, 'bios');
    expect(compareSchemas(before, renamed).tables.get(table(before, 'profiles').id)).toMatchObject({
      kind: 'changed',
      columns: new Map(),
      removedColumns: [],
    });
  });

  it('memoizes per schema pair', () => {
    const before = shopSchema();
    const after = shopSchema();
    expect(cachedCompare(before, after)).toBe(cachedCompare(before, after));
    expect(cachedCompare(before, before)).not.toBe(cachedCompare(before, after));
  });
});
