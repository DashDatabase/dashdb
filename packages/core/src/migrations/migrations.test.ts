import { describe, expect, it } from 'vitest';
import { renameTable, updateTable } from '../ir/edit';
import type { Schema } from '../ir/types';
import { diffSchemas } from '../diff/diff';
import { my, pg } from '../diff/__test-utils__/harness';
import type { DiffResult, OperationKind } from '../diff/types';
import { NOW, postgresScenario } from './__test-utils__/scenarios';
import { generateFileBundle } from './bundle';
import { generateDrizzleMigration, generatePrismaMigration } from './frameworks';
import { compactTimestamp, snakeName, summarize } from './header';
import { generateSQL } from './sql';
import { MigrationError } from './types';

const diff = (before: string, after: string, parse = pg, confirmedRenames: string[] = []) =>
  diffSchemas(parse(before), parse(after), { confirmedRenames });
const sql = (d: DiffResult, dialect: 'postgres' | 'mysql' = 'postgres', concurrentIndexes = true) =>
  generateSQL(d, dialect, { now: NOW, concurrentIndexes });
const statements = (d: DiffResult, dialect: 'postgres' | 'mysql' = 'postgres') =>
  sql(d, dialect).statements.map((s) => s.sql);
const downStatements = (d: DiffResult, dialect: 'postgres' | 'mysql' = 'postgres') =>
  sql(d, dialect).downStatements.map((s) => s.sql);

/** One schema pair per operation kind (`before`, `after`, confirmed renames). */
const PER_KIND: Record<OperationKind, [string, string, string[]?]> = {
  createNamespace: ['', 'CREATE SCHEMA app;'],
  dropNamespace: ['CREATE SCHEMA app;', ''],
  createEnum: ['', "CREATE TYPE m AS ENUM ('a');"],
  dropEnum: ["CREATE TYPE m AS ENUM ('a');", ''],
  alterEnumAddValue: [
    "CREATE TYPE m AS ENUM ('a'); CREATE TABLE t (x m);",
    "CREATE TYPE m AS ENUM ('a', 'b'); CREATE TABLE t (x m);",
  ],
  recreateEnum: [
    "CREATE TYPE m AS ENUM ('a', 'b'); CREATE TABLE t (x m);",
    "CREATE TYPE m AS ENUM ('b'); CREATE TABLE t (x m);",
  ],
  createTable: ['', 'CREATE TABLE t (id int PRIMARY KEY);'],
  dropTable: ['CREATE TABLE t (id int PRIMARY KEY);', ''],
  renameTable: [
    'CREATE TABLE users (id int, e text);',
    'CREATE TABLE app_users (id int, e text);',
    ['table:public.users=>public.app_users'],
  ],
  addColumn: ['CREATE TABLE t (a int);', 'CREATE TABLE t (a int, b text);'],
  dropColumn: ['CREATE TABLE t (a int, b text);', 'CREATE TABLE t (a int);'],
  renameColumn: [
    'CREATE TABLE t (a int, email text);',
    'CREATE TABLE t (a int, emails text);',
    ['column:public.t.email=>public.t.emails'],
  ],
  alterColumnType: ['CREATE TABLE t (a int);', 'CREATE TABLE t (a bigint);'],
  alterColumnNullability: ['CREATE TABLE t (a int);', 'CREATE TABLE t (a int NOT NULL);'],
  alterColumnDefault: ['CREATE TABLE t (a int);', 'CREATE TABLE t (a int DEFAULT 1);'],
  addPrimaryKey: [
    'CREATE TABLE t (a int NOT NULL);',
    'CREATE TABLE t (a int NOT NULL PRIMARY KEY);',
  ],
  dropPrimaryKey: [
    'CREATE TABLE t (a int NOT NULL PRIMARY KEY);',
    'CREATE TABLE t (a int NOT NULL);',
  ],
  createIndex: ['CREATE TABLE t (a int);', 'CREATE TABLE t (a int); CREATE INDEX t_a ON t (a);'],
  dropIndex: ['CREATE TABLE t (a int); CREATE INDEX t_a ON t (a);', 'CREATE TABLE t (a int);'],
  addUnique: ['CREATE TABLE t (a int);', 'CREATE TABLE t (a int UNIQUE);'],
  dropUnique: ['CREATE TABLE t (a int UNIQUE);', 'CREATE TABLE t (a int);'],
  addForeignKey: [
    'CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (u int);',
    'CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (u int REFERENCES u);',
  ],
  dropForeignKey: [
    'CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (u int REFERENCES u);',
    'CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (u int);',
  ],
  addCheck: ['CREATE TABLE t (a int);', 'CREATE TABLE t (a int CHECK (a > 0));'],
  dropCheck: ['CREATE TABLE t (a int CHECK (a > 0));', 'CREATE TABLE t (a int);'],
  setComment: [
    'CREATE TABLE t (a int);',
    "CREATE TABLE t (a int); COMMENT ON TABLE t IS 'T'; COMMENT ON COLUMN t.a IS 'A';",
  ],
};

/** The MySQL spelling of the same pairs (MySQL has no schemas-in-database or enum types). */
const toMysql = (ddl: string) =>
  ddl
    .replace(/CREATE TYPE m AS ENUM \(([^)]*)\);\s*/g, '')
    .replace(/CREATE SCHEMA app;/g, 'CREATE DATABASE app;')
    .replace(/COMMENT ON TABLE t IS '(\w+)';/g, '')
    .replace(/COMMENT ON COLUMN t\.a IS '(\w+)';/g, '')
    .replace(/CREATE TABLE t \(a int\);(\s*)$/, (m) => m);

const IRREVERSIBLE: OperationKind[] = ['dropTable', 'dropColumn', 'recreateEnum'];

describe('every operation kind', () => {
  it.each(Object.entries(PER_KIND) as [OperationKind, [string, string, string[]?]][])(
    'postgres: %s has up and down SQL',
    (kind, [before, after, renames]) => {
      const d = diff(before, after, pg, renames);
      expect(d.operations.map((o) => o.kind)).toContain(kind);
      const m = sql(d);
      expect(m.statements.length).toBeGreaterThan(0);
      expect(m.downStatements.length).toBeGreaterThan(0);
      expect(m.irreversible > 0).toBe(IRREVERSIBLE.includes(kind));
      expect(m.up.includes('IRREVERSIBLE')).toBe(IRREVERSIBLE.includes(kind));
      expect(m.down.includes('IRREVERSIBLE')).toBe(IRREVERSIBLE.includes(kind));
    },
  );

  const mysqlPairs: [string, string, string, string[]?][] = [
    ['createNamespace', '', 'CREATE DATABASE app;'],
    ['dropNamespace', 'CREATE DATABASE app;', ''],
    ['alterEnumAddValue', "CREATE TABLE t (x enum('a'));", "CREATE TABLE t (x enum('a','b'));"],
    ['recreateEnum', "CREATE TABLE t (x enum('a','b'));", "CREATE TABLE t (x enum('b'));"],
    [
      'renameTable',
      'CREATE TABLE users (id int, e text);',
      'CREATE TABLE app_users (id int, e text);',
      ['table:default.users=>default.app_users'],
    ],
    [
      'renameColumn',
      'CREATE TABLE t (a int, email text);',
      'CREATE TABLE t (a int, emails text);',
      ['column:default.t.email=>default.t.emails'],
    ],
    ['setComment', 'CREATE TABLE t (a int);', "CREATE TABLE t (a int COMMENT 'A') COMMENT='T';"],
    [
      'addForeignKey',
      'CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (u int);',
      'CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (u int, CONSTRAINT f FOREIGN KEY (u) REFERENCES u (id));',
    ],
    [
      'dropForeignKey',
      'CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (u int, CONSTRAINT f FOREIGN KEY (u) REFERENCES u (id));',
      'CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (u int);',
    ],
    ['addCheck', 'CREATE TABLE t (a int);', 'CREATE TABLE t (a int, CONSTRAINT c CHECK (a > 0));'],
    ['dropCheck', 'CREATE TABLE t (a int, CONSTRAINT c CHECK (a > 0));', 'CREATE TABLE t (a int);'],
    ...(
      [
        'createTable',
        'dropTable',
        'addColumn',
        'dropColumn',
        'alterColumnType',
        'alterColumnNullability',
        'alterColumnDefault',
        'addPrimaryKey',
        'dropPrimaryKey',
        'createIndex',
        'dropIndex',
        'addUnique',
        'dropUnique',
      ] as const
    ).map((kind): [string, string, string] => [
      kind,
      toMysql(PER_KIND[kind][0]),
      toMysql(PER_KIND[kind][1]),
    ]),
  ];
  it.each(mysqlPairs)('mysql: %s has up and down SQL', (kind, before, after, renames) => {
    const d = diff(before, after, my, renames);
    expect(d.operations.map((o) => o.kind)).toContain(kind);
    const m = sql(d, 'mysql');
    expect(m.statements.length).toBeGreaterThan(0);
    expect(m.downStatements.length).toBeGreaterThan(0);
    expect(m.statements.every((s) => !s.transactional)).toBe(true);
    expect(m.irreversible > 0).toBe(IRREVERSIBLE.includes(kind as OperationKind));
  });

  it('mysql: enum types need no statement of their own', () => {
    const d: DiffResult = {
      operations: [
        { kind: 'createEnum', enum: { namespace: 'default', name: 'e', values: ['a'] } },
      ],
      renameCandidates: [],
      warnings: [],
    };
    expect(sql(d, 'mysql').statements).toEqual([]);
    expect(sql(d, 'mysql').up).toContain('-- No changes.');
  });
});

describe('postgres specifics', () => {
  it('flags statements and maps them to operations', () => {
    const m = sql(postgresScenario.diff);
    const byId = (id: string) => postgresScenario.diff.operations[Number(id.slice(3))];
    for (const s of m.statements) expect(byId(s.operationId)).toBeDefined();
    const concurrently = m.statements.filter((s) => s.sql.includes('CONCURRENTLY'));
    expect(concurrently.map((s) => s.transactional)).toEqual([false, false]);
    expect(m.statements.find((s) => s.sql.includes('ADD VALUE'))?.transactional).toBe(false);
    expect(
      m.statements.filter((s) => s.destructive).map((s) => s.sql.split(' ').slice(0, 3).join(' ')),
    ).toEqual([
      'ALTER TABLE users',
      'DROP TABLE audit_log;',
      'ALTER TABLE posts',
      'ALTER TABLE app_users',
    ]);
    expect(m.irreversible).toBe(3);
  });

  it('keeps indexes in the transaction when asked, and for new or unique indexes', () => {
    const d = diff(
      'CREATE TABLE t (a int);',
      'CREATE TABLE t (a int); CREATE INDEX t_a ON t (a); CREATE UNIQUE INDEX t_u ON t (a);',
    );
    expect(sql(d, 'postgres', false).up).not.toContain('CONCURRENTLY');
    expect(statements(d)).toEqual([
      'CREATE INDEX CONCURRENTLY t_a ON t (a);',
      'CREATE UNIQUE INDEX t_u ON t (a);',
    ]);
    const created = diff(
      '',
      'CREATE TABLE t (a int); CREATE INDEX t_a ON t USING hash (a DESC NULLS LAST) WHERE a > 0;',
    );
    expect(statements(created)).toContain(
      'CREATE INDEX t_a ON t USING hash (a DESC NULLS LAST) WHERE a > 0;',
    );
  });

  it('writes an empty diff as no changes', () => {
    expect(sql({ operations: [], renameCandidates: [], warnings: [] }).up).toContain(
      '-- No changes.',
    );
  });

  it('moves tables across schemas with SET SCHEMA, then renames', () => {
    const before = pg('CREATE SCHEMA audit; CREATE TABLE events (id int);');
    const audit = before.namespaces.find((n) => n.name === 'audit')?.id ?? '';
    const id = before.tables[0]?.id ?? '';
    const moved = updateTable(renameTable(before, id, 'log'), id, { namespace: audit });
    expect(statements(diffSchemas(before, moved))).toEqual([
      'ALTER TABLE events SET SCHEMA audit;',
      'ALTER TABLE audit.events RENAME TO log;',
    ]);
    const onlyMoved = updateTable(before, id, { namespace: audit });
    expect(statements(diffSchemas(before, onlyMoved))).toEqual([
      'ALTER TABLE events SET SCHEMA audit;',
    ]);
  });

  it('handles every identity and default transition', () => {
    expect(
      statements(
        diff(
          'CREATE TABLE t (a int GENERATED ALWAYS AS IDENTITY);',
          'CREATE TABLE t (a int GENERATED BY DEFAULT AS IDENTITY);',
        ),
      ),
    ).toEqual(['ALTER TABLE t ALTER COLUMN a SET GENERATED BY DEFAULT;']);
    expect(
      statements(
        diff(
          'CREATE TABLE t (a int GENERATED BY DEFAULT AS IDENTITY);',
          'CREATE TABLE t (a int GENERATED ALWAYS AS IDENTITY);',
        ),
      ),
    ).toEqual(['ALTER TABLE t ALTER COLUMN a SET GENERATED ALWAYS;']);
    expect(
      statements(
        diff(
          'CREATE TABLE t (a int GENERATED ALWAYS AS IDENTITY);',
          'CREATE TABLE t (a int NOT NULL);',
        ),
      ),
    ).toEqual(['ALTER TABLE t ALTER COLUMN a DROP IDENTITY;']);
    expect(
      statements(diff('CREATE TABLE t (a int DEFAULT 1);', 'CREATE TABLE t (a int);')),
    ).toEqual(['ALTER TABLE t ALTER COLUMN a DROP DEFAULT;']);
    expect(
      statements(
        diff(
          'CREATE TABLE t (a int NOT NULL);',
          'CREATE TABLE t (a int GENERATED ALWAYS AS IDENTITY);',
        ),
      ),
    ).toEqual([
      'ALTER TABLE t ALTER COLUMN a ADD GENERATED ALWAYS AS IDENTITY;',
      "SELECT setval(pg_get_serial_sequence('t', 'a'), COALESCE((SELECT MAX(a) FROM t), 0) + 1, false);",
    ]);
    expect(
      statements(diff('CREATE TABLE t (a int);', "CREATE TABLE t (a int DEFAULT nextval('s'));")),
    ).toEqual([
      'CREATE SEQUENCE IF NOT EXISTS s OWNED BY t.a;',
      "ALTER TABLE t ALTER COLUMN a SET DEFAULT nextval('s'::regclass);",
      "SELECT setval('s', COALESCE((SELECT MAX(a) FROM t), 0) + 1, false);",
    ]);
  });

  it('converts enum columns through text, keeping a default only where needed', () => {
    expect(
      statements(
        diff(
          "CREATE TYPE m AS ENUM ('a'); CREATE TABLE t (x text DEFAULT 'a');",
          "CREATE TYPE m AS ENUM ('a'); CREATE TABLE t (x m DEFAULT 'a');",
        ),
      ),
    ).toEqual([
      'ALTER TABLE t ALTER COLUMN x DROP DEFAULT;',
      'ALTER TABLE t ALTER COLUMN x TYPE m USING x::text::m;',
      "ALTER TABLE t ALTER COLUMN x SET DEFAULT 'a';",
    ]);
    // The old default is dropped before the type change even when the new column has none.
    expect(
      statements(diff("CREATE TABLE t (x text DEFAULT 'a');", 'CREATE TABLE t (x int);')),
    ).toEqual([
      'ALTER TABLE t ALTER COLUMN x DROP DEFAULT;',
      'ALTER TABLE t ALTER COLUMN x TYPE int USING x::int;',
      'ALTER TABLE t ALTER COLUMN x DROP DEFAULT;',
    ]);
    expect(
      statements(
        diff(
          'CREATE TABLE t (x serial);',
          "CREATE TABLE t (x bigint NOT NULL DEFAULT nextval('t_x_seq'));",
        ),
      ),
    ).toEqual(['ALTER TABLE t ALTER COLUMN x TYPE bigint USING x::bigint;']);
    expect(
      statements(
        diff(
          "CREATE TYPE m AS ENUM ('a', 'b'); CREATE TABLE t (x m DEFAULT 'a');",
          "CREATE TYPE m AS ENUM ('a'); CREATE TABLE t (x m DEFAULT 'a');",
        ),
      ),
    ).toContain("ALTER TABLE t ALTER COLUMN x SET DEFAULT 'a';");
  });

  it('writes keys, comments and namespaces', () => {
    expect(
      statements(
        diff(
          '',
          "CREATE SCHEMA app; CREATE TABLE app.t (a int NOT NULL, CONSTRAINT t_pk PRIMARY KEY (a), CONSTRAINT t_u UNIQUE (a)); COMMENT ON TABLE app.t IS 'T'; COMMENT ON COLUMN app.t.a IS 'it''s';",
        ),
      ),
    ).toEqual([
      'CREATE SCHEMA app;',
      'CREATE TABLE app.t (\n  a int NOT NULL,\n  CONSTRAINT t_pk PRIMARY KEY (a),\n  CONSTRAINT t_u UNIQUE (a)\n);',
      "COMMENT ON TABLE app.t IS 'T';",
      "COMMENT ON COLUMN app.t.a IS 'it''s';",
    ]);
    expect(
      downStatements(
        diff('CREATE TABLE t (a int NOT NULL PRIMARY KEY);', 'CREATE TABLE t (a int NOT NULL);'),
      ),
    ).toEqual(['ALTER TABLE t ADD PRIMARY KEY (a);']);
    expect(
      statements(
        diff(
          'CREATE TABLE t (a int NOT NULL, CONSTRAINT k PRIMARY KEY (a));',
          'CREATE TABLE t (a int NOT NULL);',
        ),
      ),
    ).toEqual(['ALTER TABLE t DROP CONSTRAINT k;']);
    expect(
      statements(
        diff(
          'CREATE TABLE t (a int);',
          "CREATE TABLE t (a int, b text, c serial); COMMENT ON COLUMN t.b IS 'B';",
        ),
      ),
    ).toEqual([
      'ALTER TABLE t ADD COLUMN b text;',
      "COMMENT ON COLUMN t.b IS 'B';",
      'ALTER TABLE t ADD COLUMN c serial NOT NULL;',
    ]);
    expect(
      statements(
        diff(
          '',
          'CREATE TABLE t (a int GENERATED ALWAYS AS (1) STORED, b int GENERATED ALWAYS AS IDENTITY);',
        ),
      )[0],
    ).toBe(
      'CREATE TABLE t (\n  a int GENERATED ALWAYS AS (1) STORED,\n  b int GENERATED ALWAYS AS IDENTITY NOT NULL\n);',
    );
    expect(
      downStatements(
        diff("CREATE TABLE t (a int); COMMENT ON TABLE t IS 'T';", 'CREATE TABLE t (a int);'),
      ),
    ).toEqual(["COMMENT ON TABLE t IS 'T';"]);
  });

  it('writes foreign key actions, and recreates dropped tables with their indexes in the down migration', () => {
    const d = diff(
      'CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (u int);',
      'CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (u int REFERENCES u ON UPDATE CASCADE);',
    );
    expect(statements(d)).toEqual([
      'ALTER TABLE t ADD CONSTRAINT t_u_fkey FOREIGN KEY (u) REFERENCES u (id) ON UPDATE CASCADE;',
    ]);
    const dropped = diff('CREATE TABLE t (a int); CREATE INDEX t_a ON t (a);', '');
    expect(downStatements(dropped)).toEqual([
      'CREATE TABLE t (\n  a int\n);',
      'CREATE INDEX t_a ON t (a);',
    ]);
  });
});

describe('mysql specifics', () => {
  it('restates columns, merging all changes to one column', () => {
    expect(
      statements(
        diff(
          "CREATE TABLE t (x int, s enum('a'));",
          "CREATE TABLE t (x bigint NOT NULL DEFAULT 2 COMMENT 'X', s enum('a','b') NOT NULL);",
          my,
        ),
        'mysql',
      ),
    ).toEqual([
      "ALTER TABLE t MODIFY COLUMN x bigint NOT NULL DEFAULT 2 COMMENT 'X';",
      "ALTER TABLE t MODIFY COLUMN s enum('a','b') NOT NULL;",
    ]);
    const m = sql(
      diff(
        "CREATE TABLE t (s enum('a'), r enum('a'));",
        "CREATE TABLE t (s enum('a','b','c'), r enum('a','b'));",
        my,
      ),
      'mysql',
    );
    expect(m.statements.map((s) => s.sql)).toEqual([
      "ALTER TABLE t MODIFY COLUMN r enum('a','b');",
      "ALTER TABLE t MODIFY COLUMN s enum('a','b','c');",
    ]);
    expect(m.statements[1]?.operationIds).toEqual(['op-1', 'op-2']);
  });

  it('writes table options, auto-increment, FK actions, index methods and qualified names', () => {
    const created = statements(
      diff(
        '',
        'CREATE TABLE shop.t (id int AUTO_INCREMENT PRIMARY KEY, u timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT t_u UNIQUE (u)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; CREATE FULLTEXT INDEX ft ON shop.t (u); CREATE INDEX h ON shop.t (u DESC) USING HASH;',
        my,
      ),
      'mysql',
    );
    expect(created).toEqual([
      'CREATE DATABASE shop;',
      'CREATE TABLE shop.t (\n  id int NOT NULL AUTO_INCREMENT,\n  u timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (id),\n  UNIQUE KEY t_u (u)\n) ENGINE=innodb DEFAULT CHARSET=utf8mb4;',
      'CREATE FULLTEXT INDEX ft ON shop.t (u);',
      'CREATE INDEX h ON shop.t (u DESC) USING HASH;',
    ]);
    const fk = diff(
      'CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (u int);',
      'CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (u int, CONSTRAINT f FOREIGN KEY (u) REFERENCES u (id) ON DELETE SET NULL ON UPDATE CASCADE);',
      my,
    );
    expect(statements(fk, 'mysql')).toEqual([
      'ALTER TABLE t ADD CONSTRAINT f FOREIGN KEY (u) REFERENCES u (id) ON DELETE SET NULL ON UPDATE CASCADE;',
    ]);
    expect(
      downStatements(
        diff("CREATE TABLE t (a int) COMMENT='x';", 'CREATE TABLE t (a int);', my),
        'mysql',
      ),
    ).toEqual(["ALTER TABLE t COMMENT = 'x';"]);
    expect(
      statements(
        diff("CREATE TABLE t (a int) COMMENT='x';", 'CREATE TABLE t (a int);', my),
        'mysql',
      ),
    ).toEqual(["ALTER TABLE t COMMENT = '';"]);
    expect(
      statements(
        diff('', "CREATE TABLE t (id int DEFAULT 1) ROW_FORMAT=DYNAMIC COMMENT='c';", my),
        'mysql',
      )[0],
    ).toBe("CREATE TABLE t (\n  id int DEFAULT 1\n) ROW_FORMAT=dynamic COMMENT='c';");
  });

  it('ignores sequence defaults it cannot express', () => {
    const d: DiffResult = {
      operations: [
        {
          kind: 'addColumn',
          table: { namespace: 'default', name: 't' },
          column: {
            name: 'a',
            nativeType: 'int',
            logicalType: { kind: 'int' },
            nullable: true,
            default: { kind: 'sequence', name: 's' },
            autoIncrement: false,
            comment: null,
            metadata: {},
          },
        },
      ],
      renameCandidates: [],
      warnings: [],
    };
    expect(statements(d, 'mysql')).toEqual(['ALTER TABLE t ADD COLUMN a int;']);
  });
});

describe('framework generators and bundle', () => {
  const sqlite: Schema = { ...pg('CREATE TABLE t (a int);'), dialect: 'sqlite' };
  const empty: DiffResult = { operations: [], renameCandidates: [], warnings: [] };

  it('reject SQLite', async () => {
    expect(() => generateSQL(empty, 'sqlite' as never)).toThrow(MigrationError);
    expect(() => generatePrismaMigration(empty, sqlite, { name: 'x' })).toThrow(
      /not supported for sqlite/,
    );
    await expect(generateDrizzleMigration(empty, sqlite, { name: 'x' })).rejects.toThrow(
      /not supported for sqlite/,
    );
  });

  it('defaults the timestamp to now, and writes empty migrations', async () => {
    const files = await generateFileBundle({
      diff: empty,
      after: pg('CREATE TABLE t (a int);'),
      targets: ['sql', 'drizzle'],
      name: 'Nothing!',
    });
    expect(files.map((f) => f.path)).toContain('drizzle/0000_nothing.sql');
    expect(files.find((f) => f.path === 'drizzle/0000_nothing.sql')?.contents).toContain(
      '-- No changes.',
    );
    expect(
      generatePrismaMigration(empty, pg('CREATE TABLE t (a int);'), { name: 'x' }),
    ).toHaveLength(4);
    expect(generateSQL(empty, 'postgres').up).toMatch(/^-- Generated by DashDB on \d{4}-/);
    const onlyPrisma = await generateFileBundle({
      diff: empty,
      after: pg(''),
      targets: ['prisma'],
      name: 'x',
      now: NOW,
      journal: { version: '7', dialect: 'postgresql', entries: [] },
    });
    expect(onlyPrisma.map((f) => f.path.split('/')[0])).toEqual([
      'prisma',
      'prisma',
      'prisma',
      'prisma',
    ]);
    const withJournal = await generateFileBundle({
      diff: empty,
      after: pg(''),
      targets: ['drizzle'],
      name: 'x',
      now: NOW,
      journal: { version: '7', dialect: 'postgresql', entries: [] },
    });
    expect(withJournal.map((f) => f.path)).toContain('drizzle/0000_x.sql');
  });
});

describe('headers', () => {
  it('summarize, name and timestamp', () => {
    expect(summarize(postgresScenario.diff.operations)).toMatch(/^dropForeignKey 1, dropIndex 1, /);
    expect(snakeName('Add usersEmail!')).toBe('add_users_email');
    expect(snakeName('!!!')).toBe('migration');
    expect(compactTimestamp(NOW)).toBe('20261030120000');
  });
});

describe('remaining paths', () => {
  it('writes defaults on added columns, unique MySQL indexes and only known table options', () => {
    expect(
      statements(diff('CREATE TABLE t (a int);', "CREATE TABLE t (a int, b text DEFAULT 'x');")),
    ).toEqual(["ALTER TABLE t ADD COLUMN b text DEFAULT 'x';"]);
    expect(
      statements(
        diff(
          'CREATE TABLE t (a int);',
          'CREATE TABLE t (a int); CREATE UNIQUE INDEX u ON t (a);',
          my,
        ),
        'mysql',
      ),
    ).toEqual(['CREATE UNIQUE INDEX u ON t (a);']);
    const d: DiffResult = {
      operations: [
        {
          kind: 'createTable',
          table: {
            namespace: 'default',
            name: 't',
            columns: [],
            primaryKey: null,
            uniques: [],
            checks: [],
            indexes: [],
            comment: null,
            metadata: { prismaName: 'T', engine: 'innodb' },
          },
        },
      ],
      renameCandidates: [],
      warnings: [],
    };
    expect(statements(d, 'mysql')).toEqual(['CREATE TABLE t (\n\n) ENGINE=innodb;']);
  });

  it('does not count reordered enum values as irreversible', () => {
    const m = sql(diff("CREATE TYPE p AS ENUM ('a', 'b');", "CREATE TYPE p AS ENUM ('b', 'a');"));
    expect(m.irreversible).toBe(0);
    expect(m.up).not.toContain('IRREVERSIBLE:');
  });

  it('stamps Drizzle migrations with the current time by default', async () => {
    const before = Date.now();
    const files = await generateDrizzleMigration(
      { operations: [], renameCandidates: [], warnings: [] },
      pg(''),
      { name: 'x' },
    );
    const journal = JSON.parse(
      files.find((f) => f.path.endsWith('_journal.json'))?.contents ?? '{}',
    ) as { entries: { when: number }[] };
    expect(journal.entries[0]?.when).toBeGreaterThanOrEqual(before);
  });
});
