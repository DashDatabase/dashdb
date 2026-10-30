import { describe, expect, it } from 'vitest';
import { createSchema } from '../ir/edit';
import type { Schema } from '../ir/types';
import { parseDBML, parseMySQLDDL, parsePostgresDDL, parsePrisma } from '../parsers';
import { toDBML, toMySQLDDL, toPostgresDDL, toPrisma } from '../serializers';
import { loadFixtures } from '../serializers/__test-utils__/fixtures';
import { expectRoundTrip, kinds } from './__test-utils__/harness';
import { diffSchemas } from './diff';

const fixtures = loadFixtures();

/** The same schema with every id replaced, as a second import would produce. */
function freshIds(schema: Schema): Schema {
  const map = new Map<string, string>();
  const swap = (id: string) => {
    const next = map.get(id) ?? `x${map.size}`;
    map.set(id, next);
    return next;
  };
  return JSON.parse(JSON.stringify(schema), (key, value: unknown) => {
    if (typeof value !== 'string') return value;
    const idKeys = ['id', 'namespace', 'refTable', 'enumId', 'column'];
    return idKeys.includes(key) ? swap(value) : value;
  }) as Schema;
}

function withIdsReplaced(schema: Schema): Schema {
  // Column lists inside keys are arrays of ids: rewrite those too.
  const clone = freshIds(schema);
  const columnIds = new Map<string, string>();
  schema.tables.forEach((t, i) => {
    t.columns.forEach((c, j) => columnIds.set(c.id, clone.tables[i]?.columns[j]?.id ?? ''));
  });
  const remap = (ids: readonly string[]) => ids.map((id) => columnIds.get(id) ?? id);
  return {
    ...clone,
    tables: clone.tables.map((t, i) => {
      const original = schema.tables[i];
      if (!original) return t;
      return {
        ...t,
        primaryKey: t.primaryKey &&
          original.primaryKey && { ...t.primaryKey, columns: remap(original.primaryKey.columns) },
        uniques: t.uniques.map((u, j) => ({
          ...u,
          columns: remap(original.uniques[j]?.columns ?? []),
        })),
        foreignKeys: t.foreignKeys.map((f, j) => ({
          ...f,
          columns: remap(original.foreignKeys[j]?.columns ?? []),
          refColumns: remap(original.foreignKeys[j]?.refColumns ?? []),
        })),
      };
    }),
  };
}

const reparse: Record<string, (schema: Schema) => Schema> = {
  postgres: (s) => parsePostgresDDL(toPostgresDDL(s).code).schema,
  mysql: (s) => parseMySQLDDL(toMySQLDDL(s).code).schema,
  prisma: (s) => parsePrisma(toPrisma(s).code).schema,
  dbml: (s) => parseDBML(toDBML(s).code).schema,
};

describe('fixture sweep', () => {
  it.each(fixtures)(
    '$format/$file: no operations against itself or a fresh-id copy',
    ({ schema }) => {
      for (const other of [schema, withIdsReplaced(schema)]) {
        const result = diffSchemas(schema, other);
        expect(result.operations).toEqual([]);
        expect(result.renameCandidates).toEqual([]);
      }
    },
  );

  it.each(fixtures.filter((f) => f.format in reparse))(
    '$format/$file: no operations against a re-parse of its own serialization',
    ({ format, schema }) => {
      const again = (reparse[format] as (typeof reparse)[string])(schema);
      expect(diffSchemas(schema, again).operations).toEqual([]);
    },
  );

  it.each(fixtures)('$format/$file: created from and dropped to an empty schema', ({ schema }) => {
    const empty: Schema = { ...createSchema(schema.dialect), namespaces: schema.namespaces };
    const create = expectRoundTrip(empty, schema);
    expect(kinds(create.operations).every((k) => !k.startsWith('drop'))).toBe(true);
    const drop = expectRoundTrip(schema, empty);
    const firstNonFk = kinds(drop.operations).findIndex((k) => k !== 'dropForeignKey');
    expect(kinds(drop.operations).slice(firstNonFk)).not.toContain('dropForeignKey');
  });

  it('creates namespaces first and drops them last', () => {
    const multi = fixtures.find((f) => f.file === 'multi-schema.sql')?.schema as Schema;
    const empty = createSchema('postgres');
    const up = kinds(diffSchemas(empty, multi).operations);
    expect(up.slice(0, 3)).toEqual(['createNamespace', 'createNamespace', 'createNamespace']);
    const down = kinds(diffSchemas(multi, empty).operations);
    expect(down.slice(-3)).toEqual(['dropNamespace', 'dropNamespace', 'dropNamespace']);
  });
});
