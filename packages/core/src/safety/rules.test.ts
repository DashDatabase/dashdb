import { describe, expect, it } from 'vitest';
import { pg } from '../diff/__test-utils__/harness';
import { diffSchemas } from '../diff/diff';
import type { Operation } from '../diff/types';
import { renameColumn, renameTable } from '../ir/edit';
import type { Column, Table } from '../ir/types';
import { analyzeMigration } from './analyze';
import { findings } from './__test-utils__/analyze';
import { isPostgresNoRewrite } from './rules/alter-type-rewrite';
import { isMysqlInplaceType, needsCopy } from './rules/alter-table-copy-algorithm';
import { alterClause } from './rules/large-table-online-change';
import { parseType } from './rules/shared';
import { isVolatileDefault } from './rules/volatile-default-rewrite';

const USERS = 'CREATE TABLE users (id int PRIMARY KEY, email text, name text);';
const MY_USERS =
  'CREATE TABLE users (id int NOT NULL PRIMARY KEY, email varchar(40), name text) ENGINE=InnoDB;';
const large = { tableSizes: { users: 5_000_000 } };
const empty = { tableSizes: { users: 0 } };

describe('drop-table', () => {
  const run = (opts = {}) =>
    findings('drop-table', 'postgres', `${USERS} CREATE TABLE old (id int);`, USERS, opts);

  it('flags a dropped table as dangerous, with docs link and operation id', () => {
    const [f] = run();
    expect(f).toMatchObject({
      severity: 'dangerous',
      operationId: 'op-0',
      docsUrl: '/guides/postgres/drop-table',
      title: 'Dropping table public.old deletes all of its rows',
    });
    expect(f?.saferAlternative).toContain('ALTER TABLE old RENAME TO old_dropped;');
    expect(f?.saferAlternative).toContain('DROP TABLE old_dropped;');
  });

  it('is info when the table is known to be empty', () => {
    expect(run({ tableSizes: { 'public.old': 0 } })[0]?.severity).toBe('info');
  });

  it('does not fire when no table is dropped, or on MySQL', () => {
    expect(findings('drop-table', 'postgres', USERS, `${USERS} CREATE TABLE n (id int);`)).toEqual(
      [],
    );
    expect(
      findings('drop-table', 'mysql', `${MY_USERS} CREATE TABLE old (id int);`, MY_USERS),
    ).toEqual([]);
  });
});

describe('drop-column', () => {
  it('flags dropped columns on both dialects', () => {
    const [p] = findings(
      'drop-column',
      'postgres',
      USERS,
      'CREATE TABLE users (id int PRIMARY KEY, email text);',
    );
    expect(p).toMatchObject({ severity: 'dangerous', docsUrl: '/guides/postgres/drop-column' });
    expect(p?.saferAlternative).toContain('ALTER TABLE users DROP COLUMN name;');
    const [m] = findings(
      'drop-column',
      'mysql',
      MY_USERS,
      'CREATE TABLE users (id int NOT NULL PRIMARY KEY, email varchar(40)) ENGINE=InnoDB;',
    );
    expect(m).toMatchObject({ severity: 'dangerous', docsUrl: '/guides/mysql/drop-column' });
    expect(m?.saferAlternative).toContain('ALTER TABLE users DROP COLUMN name;');
  });

  it('is info on an empty table and silent when columns are only added', () => {
    expect(
      findings(
        'drop-column',
        'postgres',
        USERS,
        'CREATE TABLE users (id int PRIMARY KEY, email text);',
        empty,
      )[0]?.severity,
    ).toBe('info');
    expect(
      findings(
        'drop-column',
        'postgres',
        USERS,
        'CREATE TABLE users (id int PRIMARY KEY, email text, name text, x int);',
      ),
    ).toEqual([]);
  });
});

describe('add-not-null-without-default', () => {
  const add = (col: string, opts = {}) =>
    findings(
      'add-not-null-without-default',
      'postgres',
      USERS,
      `CREATE TABLE users (id int PRIMARY KEY, email text, name text, ${col});`,
      opts,
    );

  it('flags a NOT NULL column with no default', () => {
    const [f] = add('age int NOT NULL');
    expect(f).toMatchObject({
      severity: 'dangerous',
      docsUrl: '/guides/postgres/add-not-null-without-default',
    });
    expect(f?.saferAlternative).toContain('ADD COLUMN age int;');
    expect(f?.saferAlternative).toContain('CHECK (age IS NOT NULL) NOT VALID');
    expect(add('age int NOT NULL', empty)[0]?.severity).toBe('info');
  });

  it('ignores nullable columns, defaults, identities and new tables', () => {
    expect(add('age int')).toEqual([]);
    expect(add('age int NOT NULL DEFAULT 0')).toEqual([]);
    expect(add('age int NOT NULL GENERATED ALWAYS AS IDENTITY')).toEqual([]);
    expect(
      findings(
        'add-not-null-without-default',
        'postgres',
        USERS,
        `${USERS} CREATE TABLE t (a int NOT NULL);`,
      ),
    ).toEqual([]);
  });
});

describe('create-index-blocking', () => {
  const after = (idx: string) => `${USERS} ${idx}`;

  it('flags unique indexes, which generateSQL does not build concurrently', () => {
    const [f] = findings(
      'create-index-blocking',
      'postgres',
      USERS,
      after('CREATE UNIQUE INDEX users_email ON users (email DESC) WHERE email IS NOT NULL;'),
    );
    expect(f).toMatchObject({
      severity: 'caution',
      docsUrl: '/guides/postgres/create-index-blocking',
    });
    expect(f?.saferAlternative).toContain(
      'CREATE UNIQUE INDEX CONCURRENTLY users_email ON users (email DESC) WHERE email IS NOT NULL;',
    );
  });

  it('flags any index when concurrent indexes are off, dangerous on a large table', () => {
    const [f] = findings(
      'create-index-blocking',
      'postgres',
      USERS,
      after('CREATE INDEX users_name ON users (name);'),
      {
        concurrentIndexes: false,
        ...large,
      },
    );
    expect(f?.severity).toBe('dangerous');
    expect(f?.saferAlternative).toContain('CREATE INDEX CONCURRENTLY users_name ON users (name);');
  });

  it('ignores concurrent builds and indexes on new tables', () => {
    expect(
      findings(
        'create-index-blocking',
        'postgres',
        USERS,
        after('CREATE INDEX users_name ON users (name);'),
      ),
    ).toEqual([]);
    expect(
      findings(
        'create-index-blocking',
        'postgres',
        USERS,
        after('CREATE TABLE t (a int); CREATE UNIQUE INDEX t_a ON t (a);'),
      ),
    ).toEqual([]);
  });
});

describe('add-fk-validating', () => {
  const orders = 'CREATE TABLE orders (id int PRIMARY KEY, user_id int);';

  it('flags a foreign key added to an existing table and suggests NOT VALID', () => {
    const [f] = findings(
      'add-fk-validating',
      'postgres',
      `${USERS} ${orders}`,
      `${USERS} CREATE TABLE orders (id int PRIMARY KEY, user_id int CONSTRAINT orders_user_fk REFERENCES users (id));`,
      { tableSizes: { orders: 2_000_000 } },
    );
    expect(f).toMatchObject({
      severity: 'dangerous',
      docsUrl: '/guides/postgres/add-fk-validating',
    });
    expect(f?.saferAlternative).toContain(
      'ALTER TABLE orders ADD CONSTRAINT orders_user_fk FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;',
    );
    expect(f?.saferAlternative).toContain('VALIDATE CONSTRAINT orders_user_fk;');
  });

  it('ignores foreign keys on new tables', () => {
    expect(
      findings(
        'add-fk-validating',
        'postgres',
        USERS,
        `${USERS} CREATE TABLE orders (id int, user_id int REFERENCES users (id));`,
      ),
    ).toEqual([]);
  });
});

describe('set-not-null-scan', () => {
  it('flags SET NOT NULL and suggests the CHECK pattern', () => {
    const [f] = findings(
      'set-not-null-scan',
      'postgres',
      USERS,
      'CREATE TABLE users (id int PRIMARY KEY, email text NOT NULL, name text);',
    );
    expect(f).toMatchObject({ severity: 'caution', docsUrl: '/guides/postgres/set-not-null-scan' });
    expect(f?.saferAlternative).toContain(
      'ADD CONSTRAINT email_not_null CHECK (email IS NOT NULL) NOT VALID;',
    );
  });

  it('ignores DROP NOT NULL', () => {
    expect(
      findings(
        'set-not-null-scan',
        'postgres',
        'CREATE TABLE users (id int, email text NOT NULL);',
        'CREATE TABLE users (id int, email text);',
      ),
    ).toEqual([]);
  });
});

describe('alter-type-rewrite', () => {
  const retype = (from: string, to: string, opts = {}) =>
    findings(
      'alter-type-rewrite',
      'postgres',
      `CREATE TABLE users (id int, v ${from});`,
      `CREATE TABLE users (id int, v ${to});`,
      opts,
    );

  it('flags rewriting conversions with an expand/contract plan', () => {
    const [f] = retype('int', 'bigint', large);
    expect(f).toMatchObject({
      severity: 'dangerous',
      docsUrl: '/guides/postgres/alter-type-rewrite',
    });
    expect(f?.saferAlternative).toContain('1. [expand] Add v_new with type bigint');
    expect(retype('varchar(20)', 'varchar(10)')[0]?.severity).toBe('caution');
  });

  it('ignores conversions that do not rewrite', () => {
    expect(retype('varchar(10)', 'varchar(20)')).toEqual([]);
    expect(retype('varchar(10)', 'text')).toEqual([]);
  });

  it('knows which conversions skip the rewrite', () => {
    expect(isPostgresNoRewrite('text', 'varchar')).toBe(true);
    expect(isPostgresNoRewrite('varchar', 'varchar(10)')).toBe(false);
    expect(isPostgresNoRewrite('text', 'varchar(10)')).toBe(false);
    expect(isPostgresNoRewrite('numeric(10,2)', 'numeric(12,2)')).toBe(true);
    expect(isPostgresNoRewrite('numeric(10,2)', 'numeric')).toBe(true);
    expect(isPostgresNoRewrite('numeric(10,2)', 'numeric(12,3)')).toBe(false);
    expect(isPostgresNoRewrite('numeric(10,2)', 'numeric(8,2)')).toBe(false);
    expect(isPostgresNoRewrite('numeric', 'numeric(10,2)')).toBe(false);
    expect(isPostgresNoRewrite('timestamp', 'timestamp with time zone')).toBe(true);
    expect(isPostgresNoRewrite('timestamptz', 'timestamp')).toBe(false);
  });
});

describe('rename-breaks-app', () => {
  it('flags column and table renames on both dialects', () => {
    const [c] = findings(
      'rename-breaks-app',
      'postgres',
      USERS,
      'CREATE TABLE users (id int PRIMARY KEY, email text, full_name text);',
      {
        renames: ['column:public.users.name=>public.users.full_name'],
      },
    );
    expect(c).toMatchObject({ severity: 'caution', docsUrl: '/guides/postgres/rename-breaks-app' });
    expect(c?.title).toBe(
      'Renaming column public.users.name to full_name breaks code that uses the old name',
    );
    expect(c?.saferAlternative).toContain('ADD COLUMN full_name text;');

    const [t] = findings(
      'rename-breaks-app',
      'mysql',
      MY_USERS,
      MY_USERS.replace('users', 'members'),
      {
        renames: ['table:default.users=>default.members'],
      },
    );
    expect(t?.docsUrl).toBe('/guides/mysql/rename-breaks-app');
    expect(t?.saferAlternative).toContain('CREATE VIEW users AS SELECT * FROM members;');
  });

  it('reports a swap through a temporary name as its real renames', () => {
    const tables = pg('CREATE TABLE a (x int); CREATE TABLE b (y int);');
    const [ta, tb] = tables.tables as [Table, Table];
    const swapped = renameTable(renameTable(tables, ta.id, 'b'), tb.id, 'a');
    const t = analyzeMigration(diffSchemas(tables, swapped), 'postgres').findings;
    expect(t.map((f) => f.title)).toEqual([
      'Renaming table public.a to b breaks code that uses the old name',
      'Renaming table public.b to a breaks code that uses the old name',
    ]);

    const cols = pg('CREATE TABLE t (a int, b text);');
    const [table] = cols.tables as [Table];
    const [ca, cb] = table.columns as [Column, Column];
    const swappedCols = renameColumn(
      renameColumn(cols, table.id, ca.id, 'b'),
      table.id,
      cb.id,
      'a',
    );
    const c = analyzeMigration(diffSchemas(cols, swappedCols), 'mysql').findings;
    expect(c.map((f) => f.title)).toEqual([
      'Renaming column public.t.a to b breaks code that uses the old name',
      'Renaming column public.t.b to a breaks code that uses the old name',
    ]);
  });

  it('ignores schemas without renames', () => {
    expect(
      findings('rename-breaks-app', 'postgres', USERS, `${USERS} CREATE TABLE x (id int);`),
    ).toEqual([]);
  });
});

describe('enum-value-removal', () => {
  const before = "CREATE TYPE s AS ENUM ('a', 'b', 'c');";
  const after = "CREATE TYPE s AS ENUM ('a', 'c');";

  it('flags removed values and suggests moving rows first', () => {
    const [f] = findings(
      'enum-value-removal',
      'postgres',
      `${before} CREATE TABLE t (v s);`,
      `${after} CREATE TABLE t (v s);`,
    );
    expect(f).toMatchObject({
      severity: 'dangerous',
      docsUrl: '/guides/postgres/enum-value-removal',
    });
    expect(f?.saferAlternative).toContain(`UPDATE t SET v = '<replacement>' WHERE v IN ('b');`);
  });

  it('is info when no column with rows uses the enum', () => {
    const [f] = findings('enum-value-removal', 'postgres', before, after);
    expect(f?.severity).toBe('info');
    expect(f?.saferAlternative).toBe('No column uses the enum, so no rows need to change.');
    expect(
      findings(
        'enum-value-removal',
        'postgres',
        `${before} CREATE TABLE t (v s);`,
        `${after} CREATE TABLE t (v s);`,
        { tableSizes: { t: 0 } },
      )[0]?.severity,
    ).toBe('info');
  });

  it('ignores reorders and added values', () => {
    expect(
      findings('enum-value-removal', 'postgres', before, "CREATE TYPE s AS ENUM ('c', 'b', 'a');"),
    ).toEqual([]);
    expect(
      findings(
        'enum-value-removal',
        'postgres',
        before,
        "CREATE TYPE s AS ENUM ('a', 'b', 'c', 'd');",
      ),
    ).toEqual([]);
  });
});

describe('volatile-default-rewrite', () => {
  const add = (col: string, opts = {}) =>
    findings(
      'volatile-default-rewrite',
      'postgres',
      USERS,
      `CREATE TABLE users (id int PRIMARY KEY, email text, name text, ${col});`,
      opts,
    );

  it('flags volatile defaults, serials and identities', () => {
    const [f] = add('token uuid DEFAULT gen_random_uuid()', large);
    expect(f).toMatchObject({
      severity: 'dangerous',
      docsUrl: '/guides/postgres/volatile-default-rewrite',
    });
    expect(f?.saferAlternative).toContain('SET DEFAULT gen_random_uuid();');
    expect(add('n serial')[0]?.saferAlternative).toContain('SET DEFAULT <value>;');
    expect(add('n int GENERATED BY DEFAULT AS IDENTITY')).toHaveLength(1);
  });

  it('ignores stable and constant defaults and new tables', () => {
    expect(add('at timestamptz DEFAULT now()')).toEqual([]);
    expect(add("kind text DEFAULT 'x'")).toEqual([]);
    expect(add('note text')).toEqual([]);
    expect(
      findings(
        'volatile-default-rewrite',
        'postgres',
        USERS,
        `${USERS} CREATE TABLE t (id uuid DEFAULT gen_random_uuid());`,
      ),
    ).toEqual([]);
  });

  it('classifies defaults', () => {
    const base = {
      name: 'c',
      nativeType: 'int',
      logicalType: { kind: 'int' },
      nullable: true,
      autoIncrement: false,
      comment: null,
      metadata: {},
    } as const;
    expect(isVolatileDefault({ ...base, default: { kind: 'sequence', name: 's' } } as never)).toBe(
      true,
    );
    expect(
      isVolatileDefault({
        ...base,
        default: { kind: 'expression', sql: 'clock_timestamp()' },
      } as never),
    ).toBe(true);
    expect(isVolatileDefault({ ...base, default: { kind: 'literal', value: 1 } } as never)).toBe(
      false,
    );
  });
});

describe('alter-table-copy-algorithm', () => {
  const retype = (from: string, to: string, opts = {}) =>
    findings(
      'alter-table-copy-algorithm',
      'mysql',
      `CREATE TABLE users (id int NOT NULL PRIMARY KEY, v ${from}) ENGINE=InnoDB;`,
      `CREATE TABLE users (id int NOT NULL PRIMARY KEY, v ${to}) ENGINE=InnoDB;`,
      opts,
    );

  it('flags type changes MySQL copies, with severity from table size', () => {
    const [f] = retype('int', 'bigint');
    expect(f).toMatchObject({
      severity: 'caution',
      docsUrl: '/guides/mysql/alter-table-copy-algorithm',
    });
    expect(f?.saferAlternative).toContain('ALGORITHM=INPLACE, LOCK=NONE;');
    expect(retype('int', 'bigint', large)[0]?.severity).toBe('dangerous');
    expect(retype('int', 'bigint', empty)[0]?.severity).toBe('info');
  });

  it('flags dropping a primary key and removing enum values', () => {
    expect(
      findings(
        'alter-table-copy-algorithm',
        'mysql',
        'CREATE TABLE users (id int NOT NULL PRIMARY KEY);',
        'CREATE TABLE users (id int NOT NULL);',
      ),
    ).toHaveLength(1);
    expect(
      findings(
        'alter-table-copy-algorithm',
        'mysql',
        "CREATE TABLE users (s enum('a','b'));",
        "CREATE TABLE users (s enum('a'));",
      ),
    ).toHaveLength(1);
  });

  it('ignores in-place VARCHAR widening and other operations', () => {
    expect(retype('varchar(10)', 'varchar(40)')).toEqual([]);
    expect(
      findings(
        'alter-table-copy-algorithm',
        'mysql',
        MY_USERS,
        `${MY_USERS} CREATE TABLE x (id int);`,
      ),
    ).toEqual([]);
  });

  it('knows the VARCHAR length-prefix classes', () => {
    expect(isMysqlInplaceType('varchar(100)', 'varchar(200)')).toBe(true);
    expect(isMysqlInplaceType('varchar(60)', 'varchar(100)')).toBe(false);
    expect(isMysqlInplaceType('varchar(100)', 'varchar(50)')).toBe(false);
    expect(isMysqlInplaceType('char(10)', 'varchar(10)')).toBe(false);
    expect(needsCopy({ kind: 'createNamespace', name: 'x' })).toBe(false);
  });
});

describe('large-table-online-change', () => {
  const before = 'CREATE TABLE users (id int NOT NULL PRIMARY KEY, v int) ENGINE=InnoDB;';
  const after = 'CREATE TABLE users (id int NOT NULL PRIMARY KEY, v bigint) ENGINE=InnoDB;';

  it('suggests gh-ost and pt-osc for rebuilds of known large tables', () => {
    const [f] = findings('large-table-online-change', 'mysql', before, after, large);
    expect(f).toMatchObject({
      severity: 'dangerous',
      docsUrl: '/guides/mysql/large-table-online-change',
    });
    expect(f?.explanation).toContain('default.users has 5000000 rows');
    expect(f?.saferAlternative).toContain(
      "gh-ost --host=<host> --user=<user> --database=<database> --table=users --alter='MODIFY COLUMN v bigint' --execute",
    );
    expect(f?.saferAlternative).toContain(
      "pt-online-schema-change --alter 'MODIFY COLUMN v bigint' D=<database>,t=users --execute",
    );
  });

  it('escapes single quotes in the clause for the shell', () => {
    const [f] = findings(
      'large-table-online-change',
      'mysql',
      "CREATE TABLE users (s enum('a','b'));",
      "CREATE TABLE users (s enum('a'));",
      large,
    );
    expect(f?.saferAlternative).toContain(`--alter='MODIFY COLUMN s enum('\\''a'\\'')' --execute`);
  });

  it('names a non-default database', () => {
    const [f] = findings(
      'large-table-online-change',
      'mysql',
      before.replace('users', 'shop.users'),
      after.replace('users', 'shop.users'),
      {
        tableSizes: { 'shop.users': 2_000_000 },
      },
    );
    expect(f?.saferAlternative).toContain('--database=shop --table=users');
  });

  it('does not fire when the size is unknown or small, or for non-rebuilding changes', () => {
    expect(findings('large-table-online-change', 'mysql', before, after)).toEqual([]);
    expect(
      findings('large-table-online-change', 'mysql', before, after, { tableSizes: { users: 10 } }),
    ).toEqual([]);
    expect(
      findings(
        'large-table-online-change',
        'mysql',
        MY_USERS,
        `${MY_USERS} CREATE TABLE x (id int);`,
        large,
      ),
    ).toEqual([]);
  });

  it('falls back to a placeholder clause', () => {
    const op: Operation = {
      kind: 'dropPrimaryKey',
      table: { namespace: 'default', name: 'a' },
      primaryKey: { name: null, columns: ['id'] },
    };
    expect(alterClause(op, { namespace: 'default', name: 'b' })).toBe('<alter clause>');
  });
});

describe('parseType', () => {
  it('splits base and numeric arguments', () => {
    expect(parseType('postgres', 'character varying(20)')).toEqual({ base: 'varchar', args: [20] });
    expect(parseType('postgres', 'varchar(20)[]')).toEqual({ base: 'varchar(20)[]', args: [] });
    expect(parseType('mysql', "enum('a','b')")).toEqual({ base: "enum('a','b')", args: [] });
    expect(parseType('postgres', 'numeric(10, 2)')).toEqual({ base: 'numeric', args: [10, 2] });
  });
});
