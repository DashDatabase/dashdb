/**
 * DashDB Schema IR: a dialect-neutral, immutable model of a database schema.
 *
 * Every element carries a stable `id`, and cross-references (table → namespace, FK → table,
 * index → column, enum type → enum) point at ids rather than names, so renames never cascade.
 * Names are stored exactly as the database reports them; quoting is the serializer's job.
 */

export const IR_DIALECTS = ['postgres', 'mysql', 'sqlite'] as const;
export type IrDialect = (typeof IR_DIALECTS)[number];

/** Version of the IR format itself, bumped on breaking shape changes. */
export const IR_VERSION = 1;

export type Id = string;

/** Free-form, source-specific annotations (e.g. MySQL `engine`, Prisma model names). */
export type Metadata = Readonly<Record<string, string>>;

export type LogicalType =
  | { readonly kind: 'int' }
  | { readonly kind: 'bigint' }
  | { readonly kind: 'decimal'; readonly precision: number; readonly scale: number }
  | { readonly kind: 'text' }
  | { readonly kind: 'varchar'; readonly length: number }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'uuid' }
  | { readonly kind: 'json' }
  | { readonly kind: 'timestamp'; readonly withTimeZone: boolean }
  | { readonly kind: 'date' }
  | { readonly kind: 'bytes' }
  | { readonly kind: 'enum'; readonly enumId: Id }
  /** No logical equivalent (e.g. `point`, `int[]`); the column's `nativeType` is authoritative. */
  | { readonly kind: 'unknown' };

export type LogicalTypeKind = LogicalType['kind'];

export type ColumnDefault =
  | { readonly kind: 'literal'; readonly value: string | number | boolean | null }
  | { readonly kind: 'expression'; readonly sql: string }
  | { readonly kind: 'sequence'; readonly name: string };

export interface Column {
  readonly id: Id;
  readonly name: string;
  readonly logicalType: LogicalType;
  /** The type exactly as the database spells it; authoritative when no logical mapping exists. */
  readonly nativeType: string;
  readonly nullable: boolean;
  readonly default: ColumnDefault | null;
  readonly autoIncrement: boolean;
  readonly comment: string | null;
  readonly metadata: Metadata;
}

export interface PrimaryKey {
  readonly id: Id;
  readonly name: string | null;
  readonly columns: readonly Id[];
}

export interface IndexColumn {
  readonly column: Id;
  readonly order: 'asc' | 'desc';
  readonly nulls: 'first' | 'last' | null;
}

export interface Index {
  readonly id: Id;
  readonly name: string;
  readonly columns: readonly IndexColumn[];
  readonly unique: boolean;
  /** Access method such as `btree`, `gin` or `hash`; `null` means the dialect default. */
  readonly method: string | null;
  /** Partial-index predicate as raw SQL. */
  readonly where: string | null;
}

export interface UniqueConstraint {
  readonly id: Id;
  readonly name: string;
  readonly columns: readonly Id[];
}

export const REFERENTIAL_ACTIONS = [
  'no action',
  'restrict',
  'cascade',
  'set null',
  'set default',
] as const;
export type ReferentialAction = (typeof REFERENTIAL_ACTIONS)[number];

export interface ForeignKey {
  readonly id: Id;
  readonly name: string;
  readonly columns: readonly Id[];
  readonly refTable: Id;
  readonly refColumns: readonly Id[];
  readonly onDelete: ReferentialAction;
  readonly onUpdate: ReferentialAction;
}

export interface Check {
  readonly id: Id;
  readonly name: string;
  readonly expression: string;
}

export interface Table {
  readonly id: Id;
  readonly name: string;
  readonly namespace: Id;
  readonly columns: readonly Column[];
  readonly primaryKey: PrimaryKey | null;
  readonly indexes: readonly Index[];
  readonly uniques: readonly UniqueConstraint[];
  readonly foreignKeys: readonly ForeignKey[];
  readonly checks: readonly Check[];
  readonly comment: string | null;
  readonly metadata: Metadata;
}

export interface Enum {
  readonly id: Id;
  readonly name: string;
  readonly namespace: Id;
  readonly values: readonly string[];
}

/** A Postgres schema, a MySQL database, or SQLite's `main`. */
export interface Namespace {
  readonly id: Id;
  readonly name: string;
}

export interface Schema {
  readonly id: Id;
  readonly dialect: IrDialect;
  readonly namespaces: readonly Namespace[];
  readonly tables: readonly Table[];
  readonly enums: readonly Enum[];
  readonly version: typeof IR_VERSION;
}
