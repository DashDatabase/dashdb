import type {
  ColumnDefault,
  IndexColumn,
  LogicalType,
  Metadata,
  ReferentialAction,
} from '../ir/types';

/*
 * Operations describe schema changes by *name*, never by IR id, so a migration generator can
 * turn each one into SQL without the schemas at hand. Names follow one rule that also makes
 * down migrations work: an operation uses the names that are valid at its position in the
 * ordered list. Drops run before renames and use before-names; creates and alters run after
 * renames and use after-names.
 */

export interface QName {
  readonly namespace: string;
  readonly name: string;
}

/** A logical type with enum references by name instead of id. */
export type TypeRef =
  Exclude<LogicalType, { kind: 'enum' }> | { readonly kind: 'enum'; readonly enum: QName };

export interface ColumnDef {
  readonly name: string;
  readonly nativeType: string;
  readonly logicalType: TypeRef;
  readonly nullable: boolean;
  readonly default: ColumnDefault | null;
  readonly autoIncrement: boolean;
  readonly comment: string | null;
  readonly metadata: Metadata;
}

export interface KeyDef {
  readonly name: string | null;
  readonly columns: readonly string[];
}

export interface UniqueDef {
  readonly name: string;
  readonly columns: readonly string[];
}

export interface CheckDef {
  readonly name: string;
  readonly expression: string;
}

export interface IndexDef {
  readonly name: string;
  readonly columns: readonly (Omit<IndexColumn, 'column'> & { readonly name: string })[];
  readonly unique: boolean;
  readonly method: string | null;
  readonly where: string | null;
}

export interface ForeignKeyDef {
  readonly name: string;
  readonly columns: readonly string[];
  readonly refTable: QName;
  readonly refColumns: readonly string[];
  readonly onDelete: ReferentialAction;
  readonly onUpdate: ReferentialAction;
}

/** A table without its foreign keys, which are always separate operations. */
export interface TableDef extends QName {
  readonly columns: readonly ColumnDef[];
  readonly primaryKey: KeyDef | null;
  readonly uniques: readonly UniqueDef[];
  readonly checks: readonly CheckDef[];
  /** Empty for `createTable` (indexes are `createIndex` ops); a dropped table's indexes go with it. */
  readonly indexes: readonly IndexDef[];
  readonly comment: string | null;
  readonly metadata: Metadata;
}

export interface EnumDef extends QName {
  readonly values: readonly string[];
}

/**
 * A column's full definition before and after the migration. Carried by operations that a
 * dialect may only be able to express by restating the whole column (MySQL `MODIFY COLUMN`).
 */
export interface ColumnDefs {
  readonly before: ColumnDef;
  readonly after: ColumnDef;
}

export interface ColumnTarget extends ColumnDefs {
  readonly table: QName;
  readonly column: string;
}

export interface ColumnState {
  readonly default: ColumnDefault | null;
  readonly autoIncrement: boolean;
  /** Postgres identity flavour (`always` / `by default`), when the column is an identity. */
  readonly identity: string | null;
}

export interface ColumnType {
  readonly nativeType: string;
  readonly logicalType: TypeRef;
}

export type Operation =
  | { readonly kind: 'createNamespace'; readonly name: string }
  | { readonly kind: 'dropNamespace'; readonly name: string }
  | { readonly kind: 'createEnum'; readonly enum: EnumDef }
  | { readonly kind: 'dropEnum'; readonly enum: EnumDef }
  | {
      readonly kind: 'alterEnumAddValue';
      readonly enum: QName;
      readonly value: string;
      /** The value it is inserted before, or null to append. */
      readonly before: string | null;
      /** Full value lists before and after this value, so the change can be undone. */
      readonly from: readonly string[];
      readonly to: readonly string[];
      /** Columns using the enum (MySQL enums are per column and change through them). */
      readonly columns: readonly ColumnTarget[];
    }
  | {
      /** Values removed or reordered: the SQL layer recreates the type and converts columns. */
      readonly kind: 'recreateEnum';
      readonly enum: QName;
      readonly from: readonly string[];
      readonly to: readonly string[];
      readonly columns: readonly ColumnTarget[];
    }
  | { readonly kind: 'createTable'; readonly table: TableDef }
  | { readonly kind: 'dropTable'; readonly table: TableDef }
  | { readonly kind: 'renameTable'; readonly from: QName; readonly to: QName }
  | { readonly kind: 'addColumn'; readonly table: QName; readonly column: ColumnDef }
  | { readonly kind: 'dropColumn'; readonly table: QName; readonly column: ColumnDef }
  | {
      readonly kind: 'renameColumn';
      readonly table: QName;
      readonly from: string;
      readonly to: string;
      /** The column's definitions, when known (expand/contract plans need its type). */
      readonly definition?: ColumnDefs;
    }
  | {
      readonly kind: 'alterColumnType';
      readonly table: QName;
      readonly column: string;
      readonly from: ColumnType;
      readonly to: ColumnType;
      readonly definition: ColumnDefs;
    }
  | {
      readonly kind: 'alterColumnNullability';
      readonly table: QName;
      readonly column: string;
      readonly from: boolean;
      readonly to: boolean;
      readonly definition: ColumnDefs;
    }
  | {
      readonly kind: 'alterColumnDefault';
      readonly table: QName;
      readonly column: string;
      readonly from: ColumnState;
      readonly to: ColumnState;
      readonly definition: ColumnDefs;
    }
  | { readonly kind: 'addPrimaryKey'; readonly table: QName; readonly primaryKey: KeyDef }
  | { readonly kind: 'dropPrimaryKey'; readonly table: QName; readonly primaryKey: KeyDef }
  | {
      readonly kind: 'createIndex';
      readonly table: QName;
      readonly index: IndexDef;
      /**
       * MySQL: kept foreign keys this key is the only index for. Creating it lets MySQL drop
       * their implicit indexes; dropping it needs them back, so the drop recreates them.
       */
      readonly implicitIndexes?: readonly UniqueDef[];
    }
  | {
      readonly kind: 'dropIndex';
      readonly table: QName;
      readonly index: IndexDef;
      /**
       * MySQL: kept foreign keys this key is the only index for. Creating it lets MySQL drop
       * their implicit indexes; dropping it needs them back, so the drop recreates them.
       */
      readonly implicitIndexes?: readonly UniqueDef[];
    }
  | {
      readonly kind: 'addUnique';
      readonly table: QName;
      readonly unique: UniqueDef;
      /**
       * MySQL: kept foreign keys this key is the only index for. Creating it lets MySQL drop
       * their implicit indexes; dropping it needs them back, so the drop recreates them.
       */
      readonly implicitIndexes?: readonly UniqueDef[];
    }
  | {
      readonly kind: 'dropUnique';
      readonly table: QName;
      readonly unique: UniqueDef;
      /**
       * MySQL: kept foreign keys this key is the only index for. Creating it lets MySQL drop
       * their implicit indexes; dropping it needs them back, so the drop recreates them.
       */
      readonly implicitIndexes?: readonly UniqueDef[];
    }
  | {
      readonly kind: 'addForeignKey';
      readonly table: QName;
      readonly foreignKey: ForeignKeyDef;
      /**
       * MySQL: no other index starts with the key's columns, so MySQL maintains one of its own,
       * named after the key. It outlives DROP FOREIGN KEY unless it is dropped too.
       */
      readonly implicitIndex?: boolean;
    }
  | {
      readonly kind: 'dropForeignKey';
      readonly table: QName;
      readonly foreignKey: ForeignKeyDef;
      /**
       * MySQL: no other index starts with the key's columns, so MySQL maintains one of its own,
       * named after the key. It outlives DROP FOREIGN KEY unless it is dropped too.
       */
      readonly implicitIndex?: boolean;
    }
  | { readonly kind: 'addCheck'; readonly table: QName; readonly check: CheckDef }
  | { readonly kind: 'dropCheck'; readonly table: QName; readonly check: CheckDef }
  | {
      readonly kind: 'setComment';
      readonly table: QName;
      /** null for the table's own comment. */
      readonly column: string | null;
      readonly from: string | null;
      readonly to: string | null;
      /** The column's definitions; null for a table comment. */
      readonly definition: ColumnDefs | null;
    };

export type OperationKind = Operation['kind'];

export interface RenameCandidate {
  readonly kind: 'table' | 'column';
  /** Pass this in `confirmedRenames` to apply the rename. */
  readonly key: string;
  readonly from: QName & { readonly column?: string };
  readonly to: QName & { readonly column?: string };
  /** 0–1.2: name similarity plus 0.1 for each structural signal. */
  readonly score: number;
  readonly reasons: readonly string[];
}

/** `data-loss`: drops data. `may-fail`: can fail on existing rows. `invalid-rename`: ignored key. */
export type DiffWarningCode = 'data-loss' | 'may-fail' | 'invalid-rename';

export interface DiffWarning {
  readonly code: DiffWarningCode;
  readonly message: string;
}

export interface DiffResult {
  readonly operations: readonly Operation[];
  readonly renameCandidates: readonly RenameCandidate[];
  readonly warnings: readonly DiffWarning[];
}

export interface DiffOptions {
  /** Keys of rename candidates (or any `kind:from=>to` pair) to apply as renames. */
  readonly confirmedRenames?: readonly string[];
  /** Minimum normalized name similarity for a rename candidate. Default 0.6. */
  readonly renameThreshold?: number;
}
