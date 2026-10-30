// A deterministic, large schema for canvas performance checks (dev panel and perf tests).
import {
  addForeignKey,
  addNamespace,
  addTable,
  createSchema,
  setPrimaryKey,
  type IrDialect,
  type NewColumn,
  type Schema,
} from '@dashdb/core';

export const STRESS_TABLE_COUNT = 500;

/** Mulberry32: tiny seeded PRNG so every run builds the same schema. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXTRA_COLUMNS: readonly NewColumn[] = [
  {
    name: 'name',
    logicalType: { kind: 'varchar', length: 120 },
    nativeType: 'varchar(120)',
    nullable: false,
  },
  { name: 'status', logicalType: { kind: 'text' }, nativeType: 'text' },
  {
    name: 'amount',
    logicalType: { kind: 'decimal', precision: 12, scale: 2 },
    nativeType: 'numeric(12,2)',
  },
  { name: 'is_active', logicalType: { kind: 'boolean' }, nativeType: 'boolean', nullable: false },
  { name: 'metadata', logicalType: { kind: 'json' }, nativeType: 'jsonb' },
  { name: 'notes', logicalType: { kind: 'text' }, nativeType: 'text' },
  {
    name: 'created_at',
    logicalType: { kind: 'timestamp', withTimeZone: true },
    nativeType: 'timestamptz',
    nullable: false,
  },
  {
    name: 'updated_at',
    logicalType: { kind: 'timestamp', withTimeZone: true },
    nativeType: 'timestamptz',
  },
];

/**
 * `count` Postgres tables with 4–10 columns each. Most tables reference one or two earlier
 * tables, forming clusters of related tables like a real schema.
 */
export function stressSchema(count = STRESS_TABLE_COUNT, dialect: IrDialect = 'postgres'): Schema {
  const rand = random(count);
  let schema = addNamespace(createSchema(dialect), { name: 'public' });
  const namespace = schema.namespaces[0]?.id ?? '';
  const ids: { table: string; pk: string }[] = [];

  for (let i = 0; i < count; i++) {
    const name = `table_${String(i + 1).padStart(3, '0')}`;
    const parents = new Set<(typeof ids)[number]>();
    const wanted = i > 0 && rand() < 0.85 ? (rand() < 0.3 ? 2 : 1) : 0;
    for (let n = 0; n < wanted; n++) {
      // Mostly recent tables, so clusters stay local.
      const parent = ids[i - 1 - Math.floor(rand() * Math.min(i, 12))];
      if (parent) parents.add(parent);
    }
    const extras = EXTRA_COLUMNS.slice(0, 3 + Math.floor(rand() * (EXTRA_COLUMNS.length - 3)));
    schema = addTable(schema, {
      name,
      namespace,
      columns: [
        { name: 'id', logicalType: { kind: 'bigint' }, nativeType: 'bigint', nullable: false },
        ...[...parents].map((_, n) => ({
          name: `parent_${String(n + 1)}_id`,
          logicalType: { kind: 'bigint' } as const,
          nativeType: 'bigint',
          nullable: n > 0,
        })),
        ...extras,
      ],
    });
    const table = schema.tables.at(-1);
    const pk = table?.columns[0]?.id;
    if (!table || !pk) throw new Error('Stress table was not created');
    schema = setPrimaryKey(schema, table.id, { columns: [pk] });
    [...parents].forEach((parent, n) => {
      const column = table.columns[n + 1]?.id;
      if (!column) return;
      schema = addForeignKey(schema, table.id, {
        name: `${name}_parent_${String(n + 1)}_fkey`,
        columns: [column],
        refTable: parent.table,
        refColumns: [parent.pk],
      });
    });
    ids.push({ table: table.id, pk });
  }
  return schema;
}
