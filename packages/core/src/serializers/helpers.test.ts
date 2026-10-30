import { describe, expect, it } from 'vitest';
import { addForeignKey, addNamespace, addTable, createSchema } from '../ir/edit';
import { SchemaModel } from './model';
import {
  NameScope,
  camelCase,
  fieldName,
  modelName,
  pascalCase,
  plural,
  singular,
  words,
} from './naming';
import { defaultSql, literalSql, quoteMysql, quotePostgres, sqlString } from './sql-common';

describe('naming', () => {
  it('splits names into words', () => {
    expect(words('order_items')).toEqual(['order', 'items']);
    expect(words('OrderItems')).toEqual(['order', 'items']);
    expect(words('HTTPStatus2Code')).toEqual(['http', 'status2', 'code']);
  });

  it('builds Pascal and camel case', () => {
    expect(pascalCase('wp_users')).toBe('WpUsers');
    expect(camelCase('comment_post_ID')).toBe('commentPostId');
  });

  it.each([
    ['users', 'user'],
    ['categories', 'category'],
    ['addresses', 'address'],
    ['boxes', 'box'],
    ['status', 'status'],
    ['class', 'class'],
    ['metadata', 'metadata'],
    ['bus', 'bus'],
  ])('singularizes %s → %s conservatively', (word, expected) => {
    expect(singular(word)).toBe(expected);
  });

  it.each([
    ['category', 'categories'],
    ['box', 'boxes'],
    ['post', 'posts'],
    ['key', 'keys'],
  ])('pluralizes %s → %s', (word, expected) => {
    expect(plural(word)).toBe(expected);
  });

  it('keeps idiomatic Prisma names and converts the rest', () => {
    expect(modelName('order_items')).toBe('OrderItem');
    expect(modelName('User')).toBe('User');
    expect(modelName('Users')).toBe('Users');
    expect(fieldName('created_at')).toBe('createdAt');
    expect(fieldName('createdAt')).toBe('createdAt');
    expect(fieldName('ID')).toBe('id');
  });

  it('hands out unique names', () => {
    const scope = new NameScope(['sql']);
    expect(scope.claim('sql')).toBe('sql2');
    expect(scope.claim('user')).toBe('user');
    expect(scope.claim('user')).toBe('user2');
    expect(scope.has('user2')).toBe(true);
  });
});

describe('sql-common', () => {
  it.each([
    ['users', 'users'],
    ['Users', '"Users"'],
    ['user', '"user"'],
    ['order', '"order"'],
    ['has space', '"has space"'],
    ['we"ird', '"we""ird"'],
  ])('quotes postgres identifier %s as %s', (name, quoted) => {
    expect(quotePostgres(name)).toBe(quoted);
  });

  it.each([
    ['users', 'users'],
    ['Users', 'Users'],
    ['condition', '`condition`'],
    ['KEY', '`KEY`'],
    ['a-b', '`a-b`'],
    ['tick`', '`tick```'],
  ])('quotes mysql identifier %s as %s', (name, quoted) => {
    expect(quoteMysql(name)).toBe(quoted);
  });

  it('escapes string literals per dialect', () => {
    expect(sqlString("it's \\ here", 'postgres')).toBe("'it''s \\ here'");
    expect(sqlString("it's \\ here", 'mysql')).toBe("'it''s \\\\ here'");
    expect(literalSql(null, 'postgres')).toBe('NULL');
    expect(literalSql(true, 'mysql')).toBe('TRUE');
    expect(literalSql(-1.5, 'postgres')).toBe('-1.5');
    expect(defaultSql({ kind: 'sequence', name: "a'b_seq" }, 'postgres')).toBe(
      "nextval('a''b_seq'::regclass)",
    );
  });
});

describe('SchemaModel.sortedTables', () => {
  function schemaWith(edges: [string, string][], names: string[]) {
    let s = addNamespace(createSchema('postgres', { id: 's' }), { id: 'ns', name: 'public' });
    for (const n of names) {
      s = addTable(s, {
        id: n,
        name: n,
        namespace: 'ns',
        columns: [{ id: `${n}.id`, name: 'id', logicalType: { kind: 'int' }, nativeType: 'int' }],
      });
    }
    for (const [from, to] of edges) {
      s = addForeignKey(s, from, {
        name: `${from}_${to}`,
        columns: [`${from}.id`],
        refTable: to,
        refColumns: [`${to}.id`],
      });
    }
    return s;
  }
  const order = (s: ReturnType<typeof schemaWith>) =>
    new SchemaModel(s).sortedTables().map((t) => t.name);

  it('puts referenced tables first and breaks ties by name', () => {
    expect(
      order(
        schemaWith(
          [
            ['a', 'c'],
            ['b', 'c'],
          ],
          ['b', 'a', 'c'],
        ),
      ),
    ).toEqual(['c', 'a', 'b']);
  });

  it('ignores self-references and breaks cycles deterministically', () => {
    expect(
      order(
        schemaWith(
          [
            ['a', 'a'],
            ['a', 'b'],
            ['b', 'a'],
          ],
          ['b', 'a'],
        ),
      ),
    ).toEqual(['a', 'b']);
  });

  it('throws on dangling ids, which validated IR never has', () => {
    const model = new SchemaModel(schemaWith([], ['a']));
    expect(() => model.table('nope')).toThrow(/Unknown table/);
    expect(() => model.column('nope')).toThrow(/Unknown column/);
    expect(() => model.enum('nope')).toThrow(/Unknown enum/);
  });
});
