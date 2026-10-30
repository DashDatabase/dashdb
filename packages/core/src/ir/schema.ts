import { z } from 'zod';
import {
  IR_DIALECTS,
  IR_VERSION,
  REFERENTIAL_ACTIONS,
  type Check,
  type Column,
  type ColumnDefault,
  type Enum,
  type ForeignKey,
  type Id,
  type Index,
  type IndexColumn,
  type LogicalType,
  type Namespace,
  type PrimaryKey,
  type Schema,
  type Table,
  type UniqueConstraint,
} from './types';

// Each schema is annotated with its hand-written type so the two can never drift apart.

const idSchema = z.string().min(1);
const nameSchema = z.string().min(1);
const positiveInt = z.number().int().positive();

export const irDialectSchema = z.enum(IR_DIALECTS);
export const referentialActionSchema = z.enum(REFERENTIAL_ACTIONS);

export const logicalTypeSchema: z.ZodType<LogicalType> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('int') }),
  z.strictObject({ kind: z.literal('bigint') }),
  z
    .strictObject({
      kind: z.literal('decimal'),
      precision: positiveInt,
      scale: z.number().int().nonnegative(),
    })
    .refine((t) => t.scale <= t.precision, {
      message: 'scale must not exceed precision',
      path: ['scale'],
    }),
  z.strictObject({ kind: z.literal('text') }),
  z.strictObject({ kind: z.literal('varchar'), length: positiveInt }),
  z.strictObject({ kind: z.literal('boolean') }),
  z.strictObject({ kind: z.literal('uuid') }),
  z.strictObject({ kind: z.literal('json') }),
  z.strictObject({ kind: z.literal('timestamp'), withTimeZone: z.boolean() }),
  z.strictObject({ kind: z.literal('date') }),
  z.strictObject({ kind: z.literal('bytes') }),
  z.strictObject({ kind: z.literal('enum'), enumId: idSchema }),
]);

export const columnDefaultSchema: z.ZodType<ColumnDefault> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('literal'),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }),
  z.strictObject({ kind: z.literal('expression'), sql: z.string().min(1) }),
  z.strictObject({ kind: z.literal('sequence'), name: nameSchema }),
]);

export const columnSchema: z.ZodType<Column> = z.strictObject({
  id: idSchema,
  name: nameSchema,
  logicalType: logicalTypeSchema,
  nativeType: z.string().min(1),
  nullable: z.boolean(),
  default: columnDefaultSchema.nullable(),
  autoIncrement: z.boolean(),
  comment: z.string().nullable(),
});

const columnRefsSchema = z.array(idSchema).min(1);

export const primaryKeySchema: z.ZodType<PrimaryKey> = z.strictObject({
  id: idSchema,
  name: nameSchema.nullable(),
  columns: columnRefsSchema,
});

export const indexColumnSchema: z.ZodType<IndexColumn> = z.strictObject({
  column: idSchema,
  order: z.enum(['asc', 'desc']),
  nulls: z.enum(['first', 'last']).nullable(),
});

export const indexSchema: z.ZodType<Index> = z.strictObject({
  id: idSchema,
  name: nameSchema,
  columns: z.array(indexColumnSchema).min(1),
  unique: z.boolean(),
  method: z.string().min(1).nullable(),
  where: z.string().min(1).nullable(),
});

export const uniqueConstraintSchema: z.ZodType<UniqueConstraint> = z.strictObject({
  id: idSchema,
  name: nameSchema,
  columns: columnRefsSchema,
});

export const foreignKeySchema: z.ZodType<ForeignKey> = z.strictObject({
  id: idSchema,
  name: nameSchema,
  columns: columnRefsSchema,
  refTable: idSchema,
  refColumns: columnRefsSchema,
  onDelete: referentialActionSchema,
  onUpdate: referentialActionSchema,
});

export const checkSchema: z.ZodType<Check> = z.strictObject({
  id: idSchema,
  name: nameSchema,
  expression: z.string().min(1),
});

export const tableSchema: z.ZodType<Table> = z.strictObject({
  id: idSchema,
  name: nameSchema,
  namespace: idSchema,
  columns: z.array(columnSchema),
  primaryKey: primaryKeySchema.nullable(),
  indexes: z.array(indexSchema),
  uniques: z.array(uniqueConstraintSchema),
  foreignKeys: z.array(foreignKeySchema),
  checks: z.array(checkSchema),
  comment: z.string().nullable(),
});

export const enumSchema: z.ZodType<Enum> = z.strictObject({
  id: idSchema,
  name: nameSchema,
  namespace: idSchema,
  values: z.array(z.string()).min(1),
});

export const namespaceSchema: z.ZodType<Namespace> = z.strictObject({
  id: idSchema,
  name: nameSchema,
});

export const schemaSchema: z.ZodType<Schema> = z.strictObject({
  id: idSchema,
  dialect: irDialectSchema,
  namespaces: z.array(namespaceSchema),
  tables: z.array(tableSchema),
  enums: z.array(enumSchema),
  version: z.literal(IR_VERSION),
});

// ---------------------------------------------------------------------------------------------
// Semantic validation
// ---------------------------------------------------------------------------------------------

export type ProblemPath = readonly PropertyKey[];

interface ProblemBase {
  readonly message: string;
  readonly path: ProblemPath;
}

export type SchemaProblem = ProblemBase &
  (
    | { readonly code: 'invalid-shape' }
    | { readonly code: 'duplicate-id'; readonly id: Id }
    | { readonly code: 'duplicate-namespace-name'; readonly namespaceId: Id; readonly name: string }
    | { readonly code: 'duplicate-table-name'; readonly tableId: Id; readonly name: string }
    | {
        readonly code: 'duplicate-column-name';
        readonly tableId: Id;
        readonly columnId: Id;
        readonly name: string;
      }
    | { readonly code: 'duplicate-enum-name'; readonly enumId: Id; readonly name: string }
    | {
        readonly code: 'duplicate-index-name';
        readonly tableId: Id;
        readonly indexId: Id;
        readonly name: string;
      }
    | {
        readonly code: 'duplicate-constraint-name';
        readonly tableId: Id;
        readonly constraintId: Id;
        readonly name: string;
      }
    | { readonly code: 'unknown-namespace'; readonly elementId: Id; readonly namespaceId: Id }
    | {
        readonly code: 'fk-missing-table';
        readonly tableId: Id;
        readonly foreignKeyId: Id;
        readonly refTable: Id;
      }
    | {
        readonly code: 'fk-missing-column' | 'fk-local-missing-column';
        readonly tableId: Id;
        readonly foreignKeyId: Id;
        readonly columnId: Id;
      }
    | { readonly code: 'fk-column-count-mismatch'; readonly tableId: Id; readonly foreignKeyId: Id }
    | {
        readonly code: 'pk-nullable-column' | 'pk-missing-column';
        readonly tableId: Id;
        readonly columnId: Id;
      }
    | {
        readonly code: 'index-missing-column';
        readonly tableId: Id;
        readonly indexId: Id;
        readonly columnId: Id;
      }
    | {
        readonly code: 'unique-missing-column';
        readonly tableId: Id;
        readonly constraintId: Id;
        readonly columnId: Id;
      }
    | {
        readonly code: 'enum-missing';
        readonly tableId: Id;
        readonly columnId: Id;
        readonly enumId: Id;
      }
  );

export type SchemaProblemCode = SchemaProblem['code'];

/** Yields each item (with its index) whose key was already seen earlier in the list. */
function* duplicates<T>(items: readonly T[], key: (item: T) => string): Generator<[T, number]> {
  const seen = new Set<string>();
  for (const [i, item] of items.entries()) {
    const k = key(item);
    if (seen.has(k)) yield [item, i];
    else seen.add(k);
  }
}

/** Every element id in the tree, with the path where it appears. */
function* allIds(schema: Schema): Generator<{ id: Id; path: ProblemPath }> {
  yield { id: schema.id, path: ['id'] };
  for (const [i, ns] of schema.namespaces.entries())
    yield { id: ns.id, path: ['namespaces', i, 'id'] };
  for (const [i, en] of schema.enums.entries()) yield { id: en.id, path: ['enums', i, 'id'] };
  for (const [t, table] of schema.tables.entries()) {
    const base = ['tables', t];
    yield { id: table.id, path: [...base, 'id'] };
    for (const [i, c] of table.columns.entries())
      yield { id: c.id, path: [...base, 'columns', i, 'id'] };
    if (table.primaryKey) yield { id: table.primaryKey.id, path: [...base, 'primaryKey', 'id'] };
    for (const [i, x] of table.indexes.entries())
      yield { id: x.id, path: [...base, 'indexes', i, 'id'] };
    for (const [i, u] of table.uniques.entries())
      yield { id: u.id, path: [...base, 'uniques', i, 'id'] };
    for (const [i, f] of table.foreignKeys.entries())
      yield { id: f.id, path: [...base, 'foreignKeys', i, 'id'] };
    for (const [i, c] of table.checks.entries())
      yield { id: c.id, path: [...base, 'checks', i, 'id'] };
  }
}

function checkNames(schema: Schema): SchemaProblem[] {
  const problems: SchemaProblem[] = [];
  // Scoped keys combine an owner id and a name; JSON-encoding the pair keeps them unambiguous.
  const scoped = (owner: Id, name: string) => JSON.stringify([owner, name]);

  for (const [ns, i] of duplicates(schema.namespaces, (ns) => ns.name)) {
    problems.push({
      code: 'duplicate-namespace-name',
      namespaceId: ns.id,
      name: ns.name,
      message: `Duplicate namespace name "${ns.name}"`,
      path: ['namespaces', i, 'name'],
    });
  }

  for (const [table, i] of duplicates(schema.tables, (t) => scoped(t.namespace, t.name))) {
    problems.push({
      code: 'duplicate-table-name',
      tableId: table.id,
      name: table.name,
      message: `Duplicate table name "${table.name}"`,
      path: ['tables', i, 'name'],
    });
  }

  for (const [en, i] of duplicates(schema.enums, (e) => scoped(e.namespace, e.name))) {
    problems.push({
      code: 'duplicate-enum-name',
      enumId: en.id,
      name: en.name,
      message: `Duplicate enum name "${en.name}"`,
      path: ['enums', i, 'name'],
    });
  }

  // Postgres and SQLite index names live in the schema namespace; MySQL scopes them per table.
  const indexes = schema.tables.flatMap((table, t) =>
    table.indexes.map((index, i) => ({ table, index, path: ['tables', t, 'indexes', i, 'name'] })),
  );
  const indexKey = ({ table, index }: (typeof indexes)[number]) =>
    scoped(schema.dialect === 'mysql' ? table.id : table.namespace, index.name);
  for (const [{ table, index, path }] of duplicates(indexes, indexKey)) {
    problems.push({
      code: 'duplicate-index-name',
      tableId: table.id,
      indexId: index.id,
      name: index.name,
      message: `Duplicate index name "${index.name}"`,
      path,
    });
  }

  for (const [t, table] of schema.tables.entries()) {
    for (const [column, i] of duplicates(table.columns, (c) => c.name)) {
      problems.push({
        code: 'duplicate-column-name',
        tableId: table.id,
        columnId: column.id,
        name: column.name,
        message: `Duplicate column name "${column.name}" in table "${table.name}"`,
        path: ['tables', t, 'columns', i, 'name'],
      });
    }

    const constraints: { id: Id; name: string; path: ProblemPath }[] = [];
    const pk = table.primaryKey;
    if (pk?.name != null) {
      constraints.push({ id: pk.id, name: pk.name, path: ['tables', t, 'primaryKey', 'name'] });
    }
    for (const kind of ['uniques', 'foreignKeys', 'checks'] as const) {
      for (const [i, c] of table[kind].entries()) {
        constraints.push({ id: c.id, name: c.name, path: ['tables', t, kind, i, 'name'] });
      }
    }
    for (const [constraint] of duplicates(constraints, (c) => c.name)) {
      problems.push({
        code: 'duplicate-constraint-name',
        tableId: table.id,
        constraintId: constraint.id,
        name: constraint.name,
        message: `Duplicate constraint name "${constraint.name}" in table "${table.name}"`,
        path: constraint.path,
      });
    }
  }

  return problems;
}

function checkReferences(schema: Schema): SchemaProblem[] {
  const problems: SchemaProblem[] = [];
  const namespaceIds = new Set(schema.namespaces.map((ns) => ns.id));
  const enumIds = new Set(schema.enums.map((e) => e.id));
  const tablesById = new Map(schema.tables.map((t) => [t.id, t]));

  for (const [i, en] of schema.enums.entries()) {
    if (!namespaceIds.has(en.namespace)) {
      problems.push({
        code: 'unknown-namespace',
        elementId: en.id,
        namespaceId: en.namespace,
        message: `Enum "${en.name}" references unknown namespace ${en.namespace}`,
        path: ['enums', i, 'namespace'],
      });
    }
  }

  for (const [t, table] of schema.tables.entries()) {
    const base = ['tables', t] as const;
    const columns = new Map(table.columns.map((c) => [c.id, c]));

    if (!namespaceIds.has(table.namespace)) {
      problems.push({
        code: 'unknown-namespace',
        elementId: table.id,
        namespaceId: table.namespace,
        message: `Table "${table.name}" references unknown namespace ${table.namespace}`,
        path: [...base, 'namespace'],
      });
    }

    for (const [c, column] of table.columns.entries()) {
      const type = column.logicalType;
      if (type.kind === 'enum' && !enumIds.has(type.enumId)) {
        problems.push({
          code: 'enum-missing',
          tableId: table.id,
          columnId: column.id,
          enumId: type.enumId,
          message: `Column "${table.name}.${column.name}" references unknown enum ${type.enumId}`,
          path: [...base, 'columns', c, 'logicalType', 'enumId'],
        });
      }
    }

    if (table.primaryKey) {
      for (const [c, columnId] of table.primaryKey.columns.entries()) {
        const column = columns.get(columnId);
        const path = [...base, 'primaryKey', 'columns', c];
        if (!column) {
          problems.push({
            code: 'pk-missing-column',
            tableId: table.id,
            columnId,
            message: `Primary key of "${table.name}" references unknown column ${columnId}`,
            path,
          });
        } else if (column.nullable) {
          problems.push({
            code: 'pk-nullable-column',
            tableId: table.id,
            columnId,
            message: `Primary key column "${table.name}.${column.name}" must not be nullable`,
            path,
          });
        }
      }
    }

    for (const [x, index] of table.indexes.entries()) {
      for (const [c, { column: columnId }] of index.columns.entries()) {
        if (!columns.has(columnId)) {
          problems.push({
            code: 'index-missing-column',
            tableId: table.id,
            indexId: index.id,
            columnId,
            message: `Index "${index.name}" references unknown column ${columnId}`,
            path: [...base, 'indexes', x, 'columns', c, 'column'],
          });
        }
      }
    }

    for (const [u, unique] of table.uniques.entries()) {
      for (const [c, columnId] of unique.columns.entries()) {
        if (!columns.has(columnId)) {
          problems.push({
            code: 'unique-missing-column',
            tableId: table.id,
            constraintId: unique.id,
            columnId,
            message: `Unique constraint "${unique.name}" references unknown column ${columnId}`,
            path: [...base, 'uniques', u, 'columns', c],
          });
        }
      }
    }

    for (const [f, fk] of table.foreignKeys.entries()) {
      const fkBase = [...base, 'foreignKeys', f];
      for (const [c, columnId] of fk.columns.entries()) {
        if (!columns.has(columnId)) {
          problems.push({
            code: 'fk-local-missing-column',
            tableId: table.id,
            foreignKeyId: fk.id,
            columnId,
            message: `Foreign key "${fk.name}" references unknown local column ${columnId}`,
            path: [...fkBase, 'columns', c],
          });
        }
      }
      if (fk.columns.length !== fk.refColumns.length) {
        problems.push({
          code: 'fk-column-count-mismatch',
          tableId: table.id,
          foreignKeyId: fk.id,
          message: `Foreign key "${fk.name}" has ${fk.columns.length} columns but references ${fk.refColumns.length}`,
          path: [...fkBase, 'refColumns'],
        });
      }
      const refTable = tablesById.get(fk.refTable);
      if (!refTable) {
        problems.push({
          code: 'fk-missing-table',
          tableId: table.id,
          foreignKeyId: fk.id,
          refTable: fk.refTable,
          message: `Foreign key "${fk.name}" references unknown table ${fk.refTable}`,
          path: [...fkBase, 'refTable'],
        });
        continue;
      }
      const refColumnIds = new Set(refTable.columns.map((col) => col.id));
      for (const [c, columnId] of fk.refColumns.entries()) {
        if (!refColumnIds.has(columnId)) {
          problems.push({
            code: 'fk-missing-column',
            tableId: table.id,
            foreignKeyId: fk.id,
            columnId,
            message: `Foreign key "${fk.name}" references unknown column ${columnId} in "${refTable.name}"`,
            path: [...fkBase, 'refColumns', c],
          });
        }
      }
    }
  }

  return problems;
}

/**
 * Check an IR value for structural and semantic problems. Never throws: an empty array means the
 * schema is valid. Structural (shape) problems are reported alone, since semantic checks need a
 * well-formed tree.
 */
export function validateSchema(input: unknown): SchemaProblem[] {
  const parsed = schemaSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      code: 'invalid-shape',
      message: issue.message,
      path: issue.path,
    }));
  }
  const schema = parsed.data;

  const problems: SchemaProblem[] = [];
  for (const [{ id, path }] of duplicates(Array.from(allIds(schema)), (entry) => entry.id)) {
    problems.push({ code: 'duplicate-id', id, message: `Duplicate element id ${id}`, path });
  }
  problems.push(...checkNames(schema), ...checkReferences(schema));
  return problems;
}
