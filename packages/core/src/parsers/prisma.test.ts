import { describe, expect, it } from 'vitest';
import { parsePrisma } from './prisma';
import { MAX_INPUT_BYTES } from './types';

const parse = (source: string) => parsePrisma(source, { createId: (hint) => hint });
const datasource = (provider: string) =>
  `datasource db {\n  provider = "${provider}"\n  url = env("DB")\n}\n`;

describe('parsePrisma', () => {
  it('rejects inputs over 2 MB without parsing', () => {
    expect(parse(`// ${'x'.repeat(MAX_INPUT_BYTES)}`).diagnostics.map((d) => d.code)).toEqual([
      'input-too-large',
    ]);
  });

  it('reports syntax errors with their position', () => {
    const { schema, diagnostics } = parse('model A {\n  id Int @id\n  broken\n}');
    expect(schema.tables).toEqual([]);
    expect(diagnostics).toEqual([
      {
        severity: 'error',
        code: 'syntax-error',
        message: 'Syntax error near "broken"',
        line: 3,
        column: 3,
      },
    ]);
  });

  it.each([
    ['postgresql', 'postgres', 'public'],
    ['cockroachdb', 'postgres', 'public'],
    ['mysql', 'mysql', 'default'],
    ['sqlite', 'sqlite', 'main'],
  ])('maps provider %s to the %s dialect', (provider, dialect, namespace) => {
    const { schema, diagnostics } = parse(`${datasource(provider)}model A {\n  id Int @id\n}`);
    expect(schema.dialect).toBe(dialect);
    expect(schema.namespaces.map((n) => n.name)).toEqual([namespace]);
    expect(diagnostics).toEqual([]);
  });

  it('warns and assumes postgres for missing or unsupported providers', () => {
    expect(parse('model A {\n  id Int @id\n}').diagnostics.map((d) => d.message)).toEqual([
      'No datasource provider found; assuming postgresql',
    ]);
    const mongo = parse(`${datasource('mongodb')}model A {\n  id Int @id\n}`);
    expect(mongo.schema.dialect).toBe('postgres');
    expect(mongo.diagnostics[0]).toMatchObject({ code: 'unsupported-feature', line: 1 });
  });

  it('applies Prisma default referential actions', () => {
    const { schema } = parse(`${datasource('postgresql')}
model A {
  id Int @id
  bs B[]
  cs C[]
}
model B {
  id  Int @id
  aId Int
  a   A   @relation(fields: [aId], references: [id])
}
model C {
  id  Int  @id
  aId Int?
  a   A?   @relation(fields: [aId], references: [id], onUpdate: NoAction)
}`);
    expect(schema.tables.map((t) => t.foreignKeys.map((f) => [f.onDelete, f.onUpdate]))).toEqual([
      [],
      [['restrict', 'cascade']],
      [['set null', 'no action']],
    ]);
  });

  it('builds the implicit many-to-many join table, named after an explicit relation', () => {
    const { schema } = parse(`${datasource('mysql')}
model Post {
  id   Int   @id
  tags Tag[] @relation("Tagging")
}
model Tag {
  id    String @id
  posts Post[] @relation("Tagging")
}`);
    const join = schema.tables.find((t) => t.name === '_Tagging');
    expect(join?.columns.map((c) => [c.name, c.nativeType])).toEqual([
      ['A', 'int'],
      ['B', 'varchar(191)'],
    ]);
    expect(join?.primaryKey).toBeNull();
    // A plain unique index is a UNIQUE constraint on MySQL.
    expect(join?.uniques.map((u) => u.name)).toEqual(['_Tagging_AB_unique']);
    expect(join?.indexes.map((i) => [i.name, i.unique])).toEqual([['_Tagging_B_index', false]]);
  });

  it('reports unknown types, relations to unknown models and composite-id m-n relations', () => {
    const { diagnostics } = parse(`${datasource('postgresql')}
model A {
  id   Int    @id
  x    Banana
  b    B[]
}
model B {
  k1 Int
  k2 Int
  as A[]
  @@id([k1, k2])
}`);
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Field "x" has unknown type "Banana"',
      'Implicit many-to-many "_AToB" needs a single @id on "B"',
    ]);
  });

  it('skips ignored fields and models, views and composite types', () => {
    const { schema, diagnostics } = parse(`${datasource('postgresql')}
model A {
  id     Int @id
  legacy Int @ignore
}
view V {
  id Int
}
type T {
  x Int
}`);
    expect(schema.tables[0]?.columns.map((c) => c.name)).toEqual(['id']);
    expect(diagnostics.map((d) => d.code)).toEqual([
      'unsupported-feature',
      'unsupported-feature',
      'unsupported-feature',
    ]);
  });

  it('maps defaults, multiSchema and native types', () => {
    const { schema } = parse(`${datasource('postgresql')}
enum Status {
  ON  @map("on")
  OFF
  @@schema("core")
}
model A {
  id    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  n     Float    @default(-2.5) @db.DoublePrecision
  s     Status   @default(ON)
  flags String[]
  big   BigInt   @default(autoincrement())
  j     Json     @default("{}")
  x     Unsupported("tsvector")?
  opt   String   @default(nanoid(8))
  @@schema("core")
}`);
    const a = schema.tables[0];
    expect(schema.namespaces.map((n) => n.name)).toEqual(['core']);
    expect(
      a?.columns.map((c) => [c.name, c.nativeType, c.logicalType.kind, c.default, c.metadata]),
    ).toEqual([
      ['id', 'uuid', 'uuid', { kind: 'expression', sql: 'gen_random_uuid()' }, {}],
      ['n', 'double precision', 'unknown', { kind: 'literal', value: -2.5 }, {}],
      ['s', 'Status', 'enum', { kind: 'literal', value: 'on' }, {}],
      ['flags', 'text[]', 'unknown', null, {}],
      ['big', 'bigint', 'bigint', { kind: 'sequence', name: 'A_big_seq' }, {}],
      ['j', 'jsonb', 'json', { kind: 'literal', value: '{}' }, {}],
      ['x', 'tsvector', 'unknown', null, {}],
      ['opt', 'text', 'text', null, { prismaDefault: 'nanoid(8)' }],
    ]);
    expect(a?.primaryKey?.name).toBe('A_pkey');
  });
});
