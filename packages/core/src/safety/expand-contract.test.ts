import { describe, expect, it } from 'vitest';
import type { ColumnDef, Operation } from '../diff/types';
import { diffOf } from './__test-utils__/analyze';
import { planExpandContract, renderPlan } from './expand-contract';
import { SafetyError } from './types';

const opOf = (kind: Operation['kind'], ...args: Parameters<typeof diffOf>) => {
  const op = diffOf(...args).operations.find((o) => o.kind === kind);
  if (!op) throw new Error(`no ${kind}`);
  return op;
};

const column = (over: Partial<ColumnDef>): ColumnDef => ({
  name: 'c',
  nativeType: 'int',
  logicalType: { kind: 'int' },
  nullable: true,
  default: null,
  autoIncrement: false,
  comment: null,
  metadata: {},
  ...over,
});

describe('planExpandContract', () => {
  it('plans a Postgres column rename', () => {
    const op = opOf(
      'renameColumn',
      'postgres',
      "CREATE TABLE users (id int, name text NOT NULL DEFAULT 'x');",
      "CREATE TABLE users (id int, full_name text NOT NULL DEFAULT 'x');",
      ['column:public.users.name=>public.users.full_name'],
    );
    const plan = planExpandContract(op, { batchSize: 500 });
    expect(plan.operation).toBe('renameColumn');
    expect(plan.steps.map((s) => `${s.phase}/${s.kind}`)).toEqual([
      'expand/sql',
      'migrate/app',
      'migrate/sql',
      'migrate/sql',
      'migrate/app',
      'migrate/app',
      'contract/sql',
    ]);
    expect(renderPlan(plan)).toBe(`1. [expand] Add full_name next to name
   ALTER TABLE users ADD COLUMN full_name text;
2. [migrate] Deploy code that writes both name and full_name on every insert and update
3. [migrate] Backfill full_name from name in batches
   -- Repeat until it updates 0 rows:
   WITH batch AS (SELECT ctid FROM users WHERE full_name IS NULL AND name IS NOT NULL LIMIT 500)
   UPDATE users SET full_name = name FROM batch WHERE users.ctid = batch.ctid;
4. [migrate] Restore NOT NULL and the default on full_name
   ALTER TABLE users ALTER COLUMN full_name SET DEFAULT 'x';
   ALTER TABLE users ADD CONSTRAINT full_name_not_null CHECK (full_name IS NOT NULL) NOT VALID;
   ALTER TABLE users VALIDATE CONSTRAINT full_name_not_null;
   ALTER TABLE users ALTER COLUMN full_name SET NOT NULL;
   ALTER TABLE users DROP CONSTRAINT full_name_not_null;
5. [migrate] Deploy code that reads full_name instead of name
6. [migrate] Deploy code that no longer writes name
7. [contract] Drop name
   ALTER TABLE users DROP COLUMN name;`);
  });

  it('plans a MySQL column rename with batched UPDATE … LIMIT and a MODIFY to restore NOT NULL', () => {
    const op = opOf(
      'renameColumn',
      'mysql',
      'CREATE TABLE users (id int, name varchar(40) NOT NULL);',
      'CREATE TABLE users (id int, full_name varchar(40) NOT NULL);',
      ['column:default.users.name=>default.users.full_name'],
    );
    const sql = planExpandContract(op, { dialect: 'mysql' }).steps.flatMap((s) =>
      s.sql ? [s.sql] : [],
    );
    expect(sql).toEqual([
      'ALTER TABLE users ADD COLUMN full_name varchar(40);',
      '-- Repeat until it updates 0 rows:\nUPDATE users SET full_name = name WHERE full_name IS NULL AND name IS NOT NULL LIMIT 10000;',
      'ALTER TABLE users MODIFY COLUMN full_name varchar(40) NOT NULL;',
      'ALTER TABLE users DROP COLUMN name;',
    ]);
  });

  it('uses a <type> placeholder when the rename carries no definition', () => {
    const plan = planExpandContract({
      kind: 'renameColumn',
      table: { namespace: 'public', name: 't' },
      from: 'a',
      to: 'b',
    });
    expect(plan.steps[0]).toEqual({
      phase: 'expand',
      kind: 'sql',
      title: 'Add b next to a (replace <type> with the column type)',
      sql: 'ALTER TABLE t ADD COLUMN b <type>;',
    });
    expect(plan.steps.some((s) => s.title.startsWith('Restore'))).toBe(false);
  });

  it('restores only what the column had', () => {
    const rename = (after: ColumnDef): Operation => ({
      kind: 'renameColumn',
      table: { namespace: 'public', name: 't' },
      from: 'a',
      to: 'b',
      definition: { before: after, after },
    });
    const restore = (def: ColumnDef) =>
      planExpandContract(rename(def)).steps.find((s) => s.title.startsWith('Restore'))?.sql;
    expect(restore(column({}))).toBeUndefined();
    expect(restore(column({ default: { kind: 'literal', value: 1 } }))).toBe(
      'ALTER TABLE t ALTER COLUMN b SET DEFAULT 1;',
    );
    expect(restore(column({ default: { kind: 'sequence', name: 't_a_seq' } }))).toBeUndefined();
    expect(restore(column({ nullable: false }))).toContain('SET NOT NULL;');
  });

  it('plans a type change in both dialects, casting through text for enums', () => {
    const pgOp = opOf(
      'alterColumnType',
      'postgres',
      'CREATE TABLE t (v int NOT NULL);',
      'CREATE TABLE t (v bigint NOT NULL);',
    );
    const steps = planExpandContract(pgOp).steps;
    expect(steps.map((s) => s.title)).toEqual([
      'Add v_new with type bigint',
      'Deploy code that writes both v and v_new (converted) on every write',
      'Backfill v_new from v in batches',
      'Restore NOT NULL and the default on v_new',
      'Deploy code that reads v_new instead of v',
      'Drop the old v',
      'Optionally rename v_new back to v: this is itself a breaking rename, so keep v_new or repeat the read switch',
    ]);
    expect(steps[2]?.sql).toContain('SET v_new = v::bigint');
    expect(steps[6]?.sql).toBe('ALTER TABLE t RENAME COLUMN v_new TO v;');

    const enumOp = opOf(
      'alterColumnType',
      'postgres',
      "CREATE TYPE e AS ENUM ('a'); CREATE TABLE t (v text);",
      "CREATE TYPE e AS ENUM ('a'); CREATE TABLE t (v e);",
    );
    expect(planExpandContract(enumOp).steps[2]?.sql).toContain('SET v_new = v::text::e');

    const myOp = opOf(
      'alterColumnType',
      'mysql',
      'CREATE TABLE t (v int);',
      'CREATE TABLE t (v bigint);',
    );
    const mySteps = planExpandContract(myOp, { dialect: 'mysql' }).steps;
    expect(mySteps[2]?.sql).toBe(
      '-- Repeat until it updates 0 rows:\nUPDATE t SET v_new = v WHERE v_new IS NULL AND v IS NOT NULL LIMIT 10000;',
    );
    expect(mySteps).toHaveLength(6);
  });

  it('plans a table rename with a compatibility view', () => {
    const t = (namespace: string, name: string) => ({ namespace, name });
    const pgPlan = planExpandContract({
      kind: 'renameTable',
      from: t('public', 'users'),
      to: t('public', 'members'),
    });
    expect(pgPlan.steps).toEqual([
      {
        phase: 'expand',
        kind: 'sql',
        title: 'Rename users to members and keep the old name working through a view',
        sql: 'ALTER TABLE users RENAME TO members;\nCREATE VIEW users AS SELECT * FROM members;',
      },
      { phase: 'migrate', kind: 'app', title: 'Deploy code that uses members' },
      {
        phase: 'contract',
        kind: 'sql',
        title: 'Drop the compatibility view',
        sql: 'DROP VIEW users;',
      },
    ]);
    const moved = planExpandContract({
      kind: 'renameTable',
      from: t('public', 'users'),
      to: t('app', 'members'),
    });
    expect(moved.steps[0]?.sql).toBe(
      'ALTER TABLE users SET SCHEMA app;\nALTER TABLE app.users RENAME TO members;\nCREATE VIEW users AS SELECT * FROM app.members;',
    );
    const my = planExpandContract(
      { kind: 'renameTable', from: t('default', 'users'), to: t('default', 'members') },
      { dialect: 'mysql' },
    );
    expect(my.steps[0]?.sql).toBe(
      'RENAME TABLE users TO members;\nCREATE VIEW users AS SELECT * FROM members;',
    );
  });

  it('throws for operations it has no plan for', () => {
    const op: Operation = { kind: 'createNamespace', name: 'x' };
    expect(() => planExpandContract(op)).toThrow(SafetyError);
    expect(() => planExpandContract(op)).toThrow(
      'No expand/contract plan for createNamespace; it applies to renames and type changes',
    );
  });
});
