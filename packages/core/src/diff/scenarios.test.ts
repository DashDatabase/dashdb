import { describe, expect, it } from 'vitest';
import { renameColumn, renameTable, updateColumn, updateTable } from '../ir/edit';
import type { Schema } from '../ir/types';
import { expectRoundTrip, labels, my, pg } from './__test-utils__/harness';
import { applyOperations } from './apply';
import { diffSchemas } from './diff';
import { orderOperations } from './order';

const table = (s: Schema, name: string) => {
  const t = s.tables.find((x) => x.name === name);
  if (!t) throw new Error(`no table ${name}`);
  return t;
};
const col = (s: Schema, t: string, c: string) => {
  const found = table(s, t).columns.find((x) => x.name === c);
  if (!found) throw new Error(`no column ${t}.${c}`);
  return found;
};
const indexOf = (list: string[], label: string) => {
  const i = list.indexOf(label);
  if (i === -1) throw new Error(`missing ${label} in ${list.join(', ')}`);
  return i;
};

describe('multi-step scenarios', () => {
  it('splits a table: users → users + user_profiles', () => {
    const before = pg(
      'CREATE TABLE users (id int PRIMARY KEY, email text NOT NULL, bio text, avatar text);',
    );
    const after = pg(`CREATE TABLE users (id int PRIMARY KEY, email text NOT NULL);
CREATE TABLE user_profiles (user_id int PRIMARY KEY REFERENCES users ON DELETE CASCADE, bio text, avatar text);`);
    const result = expectRoundTrip(before, after);
    expect(labels(result.operations)).toEqual([
      'dropColumn:users.avatar',
      'dropColumn:users.bio',
      'createTable:user_profiles',
      'addForeignKey:user_profiles_user_id_fkey',
    ]);
    expect(result.warnings.filter((w) => w.code === 'data-loss').map((w) => w.message)).toEqual([
      'Column public.users.bio is dropped',
      'Column public.users.avatar is dropped',
    ]);
  });

  it('merges columns: first_name + last_name → full_name', () => {
    const before = pg(
      'CREATE TABLE people (id int, first_name varchar(100) NOT NULL, last_name varchar(100) NOT NULL);',
    );
    const after = pg('CREATE TABLE people (id int, full_name varchar(100) NOT NULL);');
    const result = expectRoundTrip(before, after);
    expect(labels(result.operations)).toEqual([
      'dropColumn:people.first_name',
      'dropColumn:people.last_name',
      'addColumn:people.full_name',
    ]);
    // Neither name is similar enough to full_name (0.56 and 0.5) to suggest a rename.
    expect(result.renameCandidates).toEqual([]);
  });

  it('changes a foreign key target', () => {
    const before = pg(`CREATE TABLE a (id int PRIMARY KEY); CREATE TABLE b (id int PRIMARY KEY);
CREATE TABLE t (ref int, CONSTRAINT t_ref_fkey FOREIGN KEY (ref) REFERENCES a (id));`);
    const after = pg(`CREATE TABLE a (id int PRIMARY KEY); CREATE TABLE b (id int PRIMARY KEY);
CREATE TABLE t (ref int, CONSTRAINT t_ref_fkey FOREIGN KEY (ref) REFERENCES b (id));`);
    const result = expectRoundTrip(before, after);
    expect(labels(result.operations)).toEqual([
      'dropForeignKey:t_ref_fkey',
      'addForeignKey:t_ref_fkey',
    ]);
    expect(result.operations[1]).toMatchObject({ foreignKey: { refTable: { name: 'b' } } });
  });

  it('drops a table that kept tables reference, and two tables with circular FKs', () => {
    const before = pg(`CREATE TABLE customers (id int PRIMARY KEY);
CREATE TABLE orders (id int PRIMARY KEY, customer_id int REFERENCES customers);
CREATE TABLE a (id int PRIMARY KEY, b_id int); CREATE TABLE b (id int PRIMARY KEY, a_id int REFERENCES a);
ALTER TABLE a ADD CONSTRAINT a_b_fkey FOREIGN KEY (b_id) REFERENCES b (id);`);
    const after = pg('CREATE TABLE orders (id int PRIMARY KEY, customer_id int);');
    const result = expectRoundTrip(before, after);
    const ops = labels(result.operations);
    expect(ops.slice(0, 3).sort()).toEqual([
      'dropForeignKey:a_b_fkey',
      'dropForeignKey:b_a_id_fkey',
      'dropForeignKey:orders_customer_id_fkey',
    ]);
    expect(ops.slice(3).sort()).toEqual(['dropTable:a', 'dropTable:b', 'dropTable:customers']);
  });

  it('swaps a column to a new enum and drops the old one', () => {
    const before = pg("CREATE TYPE status_v1 AS ENUM ('a'); CREATE TABLE t (s status_v1);");
    const after = pg("CREATE TYPE status_v2 AS ENUM ('a', 'b'); CREATE TABLE t (s status_v2);");
    expect(labels(expectRoundTrip(before, after).operations)).toEqual([
      'createEnum:status_v2',
      'alterColumnType:t.s',
      'dropEnum:status_v1',
    ]);
  });

  it('moves a table to a new schema (by id)', () => {
    const before = pg('CREATE TABLE events (id int PRIMARY KEY);');
    let after = pg('CREATE SCHEMA audit;');
    after = { ...before, namespaces: [...before.namespaces, ...after.namespaces] };
    const audit = after.namespaces.find((n) => n.name === 'audit')?.id ?? '';
    after = updateTable(after, table(before, 'events').id, { namespace: audit });
    expect(labels(expectRoundTrip(before, after).operations)).toEqual([
      'createNamespace:audit',
      'renameTable:events->events',
    ]);
  });

  it('changes a primary key that a foreign key depends on', () => {
    const before = pg(`CREATE TABLE users (id int PRIMARY KEY, tenant_id int NOT NULL);
CREATE TABLE orders (user_id int REFERENCES users);`);
    const after =
      pg(`CREATE TABLE users (id int, tenant_id int NOT NULL, PRIMARY KEY (id, tenant_id));
CREATE TABLE orders (user_id int, tenant_id int, CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id));`);
    expect(labels(expectRoundTrip(before, after).operations)).toEqual([
      'dropForeignKey:orders_user_id_fkey',
      'dropPrimaryKey:users',
      'addColumn:orders.tenant_id',
      'addPrimaryKey:users',
      'addForeignKey:orders_user_id_fkey',
    ]);
  });

  it('re-adds foreign keys around a unique key change and around type changes', () => {
    const before = pg(`CREATE TABLE p (sku text, region text, CONSTRAINT p_sku_key UNIQUE (sku));
CREATE TABLE o (sku text REFERENCES p (sku));`);
    const after = pg(`CREATE TABLE p (sku text, region text, CONSTRAINT p_sku_key2 UNIQUE (sku));
CREATE TABLE o (sku text REFERENCES p (sku));`);
    expect(labels(expectRoundTrip(before, after).operations)).toEqual([
      'dropForeignKey:o_sku_fkey',
      'dropUnique:p_sku_key',
      'addUnique:p_sku_key2',
      'addForeignKey:o_sku_fkey',
    ]);

    const mBefore = my(
      'CREATE TABLE u (id INT PRIMARY KEY); CREATE TABLE o (u_id INT, CONSTRAINT o_u FOREIGN KEY (u_id) REFERENCES u (id));',
    );
    const mAfter = my(
      'CREATE TABLE u (id BIGINT PRIMARY KEY); CREATE TABLE o (u_id BIGINT, CONSTRAINT o_u FOREIGN KEY (u_id) REFERENCES u (id));',
    );
    expect(labels(expectRoundTrip(mBefore, mAfter).operations)).toEqual([
      'dropForeignKey:o_u',
      'alterColumnType:o.u_id',
      'alterColumnType:u.id',
      'addForeignKey:o_u',
    ]);
  });

  it('turns a referential action change into drop + add under the same name', () => {
    const base = 'CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (u_id int REFERENCES u';
    expect(
      labels(expectRoundTrip(pg(`${base});`), pg(`${base} ON DELETE CASCADE);`)).operations),
    ).toEqual(['dropForeignKey:t_u_id_fkey', 'addForeignKey:t_u_id_fkey']);
  });

  it('removes an enum value used by a default, with a warning', () => {
    const before = pg(
      "CREATE TYPE st AS ENUM ('pending', 'open', 'closed'); CREATE TABLE t (s st DEFAULT 'pending');",
    );
    const after = pg(
      "CREATE TYPE st AS ENUM ('open', 'closed'); CREATE TABLE t (s st DEFAULT 'open');",
    );
    const result = expectRoundTrip(before, after);
    expect(labels(result.operations)).toEqual(['recreateEnum:st', 'alterColumnDefault:t.s']);
    expect(result.operations[0]).toMatchObject({ columns: [{ column: 's' }] });
    expect(result.warnings.map((w) => w.code)).toEqual(['data-loss']);
  });

  it('lists only surviving columns of a recreated enum', () => {
    const before = pg(
      "CREATE TYPE mood AS ENUM ('x', 'y'); CREATE TABLE a (m mood); CREATE TABLE b (m2 mood);",
    );
    const after = pg("CREATE TYPE mood AS ENUM ('x'); CREATE TABLE a (m mood);");
    const result = expectRoundTrip(before, after);
    expect(labels(result.operations)).toEqual(['dropTable:b', 'recreateEnum:mood']);
    expect(result.operations[1]).toMatchObject({
      columns: [{ table: { name: 'a' }, column: 'm' }],
    });
  });

  it('switches serial to identity as a default change, not a type change', () => {
    const result = expectRoundTrip(
      pg('CREATE TABLE t (id serial);'),
      pg('CREATE TABLE t (id integer GENERATED BY DEFAULT AS IDENTITY);'),
    );
    expect(labels(result.operations)).toEqual(['alterColumnDefault:t.id']);
    expect(result.operations[0]).toMatchObject({
      from: {
        default: { kind: 'sequence', name: 't_id_seq' },
        autoIncrement: true,
        identity: null,
      },
      to: { default: null, autoIncrement: true, identity: 'by default' },
    });
  });

  it('warns about changes that can fail on existing rows', () => {
    const result = expectRoundTrip(
      pg('CREATE TABLE t (email text);'),
      pg('CREATE TABLE t (email text NOT NULL, x int NOT NULL);'),
    );
    expect(result.warnings.map((w) => w.code)).toEqual(['may-fail', 'may-fail']);
  });

  it('does not report MySQL display widths, aliases or default spellings as changes', () => {
    const before = my(
      'CREATE TABLE t (a INT(11) UNSIGNED, b TINYINT(1), c INTEGER, d DATETIME DEFAULT now());',
    );
    const after = my(
      'CREATE TABLE t (a INT UNSIGNED, b TINYINT(1), c INT, d DATETIME DEFAULT CURRENT_TIMESTAMP);',
    );
    expect(diffSchemas(before, after).operations).toEqual([]);
    const signed = my('CREATE TABLE t (a INT, b TINYINT(4), c INT, d DATETIME DEFAULT now());');
    expect(labels(diffSchemas(before, signed).operations)).toEqual([
      'alterColumnType:t.a',
      'alterColumnType:t.b',
    ]);
  });

  it('follows MySQL per-column enums through a table rename without enum operations', () => {
    const before = my("CREATE TABLE seats (id INT PRIMARY KEY, role ENUM('a','b'));");
    const after = my("CREATE TABLE members (id INT PRIMARY KEY, role ENUM('a','b'));");
    const result = expectRoundTrip(before, after, {
      confirmedRenames: ['table:default.seats=>default.members'],
    });
    expect(labels(result.operations)).toEqual(['renameTable:seats->members']);
  });
});

describe('renames', () => {
  const before = pg('CREATE TABLE users (id int, email text);');
  const after = pg('CREATE TABLE app_users (id int, email text);');

  it('returns candidates but does not apply them without confirmation', () => {
    const result = expectRoundTrip(before, after);
    expect(labels(result.operations)).toEqual(['dropTable:users', 'createTable:app_users']);
    expect(result.renameCandidates).toEqual([
      {
        kind: 'table',
        key: 'table:public.users=>public.app_users',
        from: { namespace: 'public', name: 'users' },
        to: { namespace: 'public', name: 'app_users' },
        score: 0.825,
        reasons: ['similar-name 0.63', 'same-position', 'shared-columns'],
      },
    ]);
  });

  it('applies confirmed candidates', () => {
    const result = expectRoundTrip(before, after, {
      confirmedRenames: ['table:public.users=>public.app_users'],
    });
    expect(labels(result.operations)).toEqual(['renameTable:users->app_users']);
    expect(result.warnings).toEqual([]);
  });

  it('confirms iteratively: column candidates appear once the table rename is confirmed', () => {
    const b = pg('CREATE TABLE users (id int, mail text);');
    const a = pg('CREATE TABLE app_users (id int, email text);');
    const first = diffSchemas(b, a);
    expect(first.renameCandidates.map((c) => c.kind)).toEqual(['table']);
    const tableKey = first.renameCandidates[0]?.key ?? '';
    const second = diffSchemas(b, a, { confirmedRenames: [tableKey] });
    expect(second.renameCandidates.map((c) => c.key)).toEqual([
      'column:public.users.mail=>public.app_users.email',
      'table:public.users=>public.app_users',
    ]);
    const both = expectRoundTrip(b, a, {
      confirmedRenames: [tableKey, 'column:public.users.mail=>public.app_users.email'],
    });
    expect(labels(both.operations)).toEqual([
      'renameTable:users->app_users',
      'renameColumn:app_users.mail->email',
    ]);
    const columnOnly = diffSchemas(b, a, {
      confirmedRenames: ['column:public.users.mail=>public.app_users.email'],
    });
    expect(columnOnly.warnings.map((w) => w.code)).toContain('invalid-rename');
  });

  it('honours confirmed renames the heuristic would not suggest, combined with a type change', () => {
    const result = expectRoundTrip(
      pg('CREATE TABLE items (qty int);'),
      pg('CREATE TABLE items (quantity bigint);'),
      {
        confirmedRenames: ['column:public.items.qty=>public.items.quantity'],
      },
    );
    expect(labels(result.operations)).toEqual([
      'renameColumn:items.qty->quantity',
      'alterColumnType:items.quantity',
    ]);
  });

  it('rejects two confirmed renames onto the same target', () => {
    const b = pg('CREATE TABLE p (first_name text, last_name text);');
    const a = pg('CREATE TABLE p (full_name text);');
    const result = diffSchemas(b, a, {
      confirmedRenames: [
        'column:public.p.first_name=>public.p.full_name',
        'column:public.p.last_name=>public.p.full_name',
      ],
    });
    expect(labels(result.operations)).toEqual([
      'dropColumn:p.last_name',
      'renameColumn:p.first_name->full_name',
    ]);
    expect(result.warnings.map((w) => w.code)).toContain('invalid-rename');
  });

  it('applies id matches as renames without confirmation, before name matching', () => {
    const b = pg('CREATE TABLE users (id int PRIMARY KEY);');
    let a = renameTable(b, table(b, 'users').id, 'customers');
    a = {
      ...a,
      tables: [
        ...a.tables,
        ...pg('CREATE TABLE users (x int);').tables.map((t) => ({
          ...t,
          namespace: table(a, 'customers').namespace,
        })),
      ],
    };
    const result = expectRoundTrip(b, a);
    expect(labels(result.operations)).toEqual([
      'renameTable:users->customers',
      'createTable:users',
    ]);
    expect(result.renameCandidates).toEqual([]);
  });

  it('keeps foreign keys and indexes on renamed columns untouched', () => {
    const b = pg(`CREATE TABLE users (id int PRIMARY KEY);
CREATE TABLE orders (uid int REFERENCES users); CREATE INDEX orders_uid ON orders (uid);`);
    const a = renameColumn(b, table(b, 'users').id, col(b, 'users', 'id').id, 'user_id');
    expect(labels(expectRoundTrip(b, a).operations)).toEqual(['renameColumn:users.id->user_id']);
  });

  it('swaps names through a temporary name, and orders chains', () => {
    const b = pg('CREATE TABLE t (a int, b text, c bool);');
    const ta = table(b, 't').id;
    const swap = renameColumn(
      renameColumn(b, ta, col(b, 't', 'a').id, 'b'),
      ta,
      col(b, 't', 'b').id,
      'a',
    );
    expect(labels(expectRoundTrip(b, swap).operations)).toEqual([
      'renameColumn:t.a->__dashdb_tmp_1',
      'renameColumn:t.b->a',
      'renameColumn:t.__dashdb_tmp_1->b',
    ]);
    const chain = renameColumn(
      renameColumn(b, ta, col(b, 't', 'b').id, 'c2'),
      ta,
      col(b, 't', 'a').id,
      'b',
    );
    expect(labels(expectRoundTrip(b, chain).operations)).toEqual([
      'renameColumn:t.b->c2',
      'renameColumn:t.a->b',
    ]);

    const tables = pg('CREATE TABLE x (id int); CREATE TABLE y (id int);');
    const swapped = renameTable(
      renameTable(tables, table(tables, 'x').id, 'y'),
      table(tables, 'y').id,
      'x',
    );
    expect(labels(expectRoundTrip(tables, swapped).operations)).toEqual([
      'renameTable:x->__dashdb_tmp_1',
      'renameTable:y->x',
      'renameTable:__dashdb_tmp_1->y',
    ]);
  });

  it('respects the threshold and needs a structural signal', () => {
    const b = pg('CREATE TABLE t (id int, orderitem int);');
    const a = pg('CREATE TABLE t (id int, order_item int);');
    expect(diffSchemas(b, a).renameCandidates.map((c) => c.score)).toEqual([1.2]);
    const different = pg('CREATE TABLE t (id int, xyz int);');
    expect(diffSchemas(b, different, { renameThreshold: 0 }).renameCandidates).toHaveLength(1);
    expect(diffSchemas(b, different).renameCandidates).toEqual([]);
    expect(
      diffSchemas(
        pg('CREATE TABLE t (email varchar(255));'),
        pg('CREATE TABLE t (email_address text);'),
      ).renameCandidates,
    ).toEqual([]);
  });

  it('treats enums renamed by id as a different enum', () => {
    const b = pg("CREATE TYPE mood AS ENUM ('a'); CREATE TABLE t (m mood);");
    const renamed: Schema = { ...b, enums: b.enums.map((e) => ({ ...e, name: 'feeling' })) };
    const fixed = updateColumn(renamed, table(b, 't').id, col(b, 't', 'm').id, {
      nativeType: 'feeling',
    });
    expect(labels(expectRoundTrip(b, fixed).operations)).toEqual([
      'createEnum:feeling',
      'alterColumnType:t.m',
      'dropEnum:mood',
    ]);
  });
});

describe('ordering', () => {
  it('drops FKs before the columns and tables they reference, and adds them last', () => {
    const before = pg(`CREATE TABLE u (id int PRIMARY KEY, legacy int UNIQUE);
CREATE TABLE t (u_legacy int REFERENCES u (legacy)); CREATE INDEX t_l ON t (u_legacy);`);
    const after = pg(`CREATE TYPE k AS ENUM ('a'); CREATE TABLE u (id int PRIMARY KEY);
CREATE TABLE t (u_id int REFERENCES u, kind k); CREATE INDEX t_u ON t (u_id);`);
    const ops = labels(expectRoundTrip(before, after).operations);
    expect(indexOf(ops, 'dropForeignKey:t_u_legacy_fkey')).toBeLessThan(
      indexOf(ops, 'dropColumn:u.legacy'),
    );
    expect(indexOf(ops, 'dropIndex:t_l')).toBeLessThan(indexOf(ops, 'dropColumn:t.u_legacy'));
    expect(indexOf(ops, 'createEnum:k')).toBeLessThan(indexOf(ops, 'addColumn:t.kind'));
    expect(indexOf(ops, 'addColumn:t.u_id')).toBeLessThan(indexOf(ops, 'createIndex:t_u'));
    expect(ops.at(-1)).toBe('addForeignKey:t_u_id_fkey');
  });

  it('creates self-referencing tables before their foreign key', () => {
    const result = expectRoundTrip(
      pg(''),
      pg('CREATE TABLE c (id int PRIMARY KEY, parent_id int REFERENCES c);'),
    );
    expect(labels(result.operations)).toEqual(['createTable:c', 'addForeignKey:c_parent_id_fkey']);
  });

  it('is deterministic regardless of input order', () => {
    const before = pg('CREATE TABLE a (x int); CREATE TABLE b (y int); CREATE TABLE c (z int);');
    const after = pg(
      'CREATE TABLE c (z bigint); CREATE TABLE d (w int); CREATE TABLE a (x int NOT NULL);',
    );
    const forward = diffSchemas(before, after);
    const reversed = diffSchemas(
      { ...before, tables: [...before.tables].reverse() },
      { ...after, tables: [...after.tables].reverse() },
    );
    expect(reversed.operations).toEqual(forward.operations);
    expect(orderOperations([...forward.operations].reverse())).toEqual(forward.operations);
  });

  it('applyOperations rejects invalid sequences, naming the operation', () => {
    const s = pg(`CREATE TYPE m AS ENUM ('a'); CREATE TABLE u (id int PRIMARY KEY);
CREATE TABLE t (u_id int REFERENCES u, m m); CREATE INDEX t_i ON t (u_id);`);
    const u = { namespace: 'public', name: 'u' };
    const t = { namespace: 'public', name: 't' };
    const col = {
      name: 'u_id',
      nativeType: 'int',
      logicalType: { kind: 'int' as const },
      nullable: true,
      default: null,
      autoIncrement: false,
      comment: null,
      metadata: {},
    };
    const cases: [Parameters<typeof applyOperations>[1], RegExp][] = [
      [
        [
          {
            kind: 'dropTable',
            table: {
              ...u,
              columns: [],
              primaryKey: null,
              uniques: [],
              checks: [],
              indexes: [],
              comment: null,
              metadata: {},
            },
          },
        ],
        /still referenced/,
      ],
      [[{ kind: 'dropColumn', table: t, column: col }], /still used/],
      [
        [{ kind: 'dropEnum', enum: { namespace: 'public', name: 'm', values: ['a'] } }],
        /still used/,
      ],
      [[{ kind: 'renameTable', from: t, to: u }], /exists/],
      [
        [
          {
            kind: 'addForeignKey',
            table: t,
            foreignKey: {
              name: 'x',
              columns: ['u_id'],
              refTable: t,
              refColumns: ['u_id'],
              onDelete: 'no action',
              onUpdate: 'no action',
            },
          },
        ],
        /not a primary or unique key/,
      ],
      [
        [{ kind: 'dropPrimaryKey', table: u, primaryKey: { name: null, columns: ['id'] } }],
        /still references/,
      ],
      [
        [{ kind: 'alterColumnNullability', table: t, column: 'u_id', from: false, to: true }],
        /differs/,
      ],
      [[{ kind: 'dropNamespace', name: 'public' }], /cannot be dropped/],
    ];
    for (const [ops, message] of cases) {
      expect(() => applyOperations(s, ops)).toThrow(message);
    }
    expect(() =>
      applyOperations(s, [
        { kind: 'createNamespace', name: 'x' },
        { kind: 'createNamespace', name: 'x' },
      ]),
    ).toThrow(/Operation 1 \(createNamespace\)/);
  });
});
