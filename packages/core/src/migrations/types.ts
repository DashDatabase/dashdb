import type { DiffWarning, Operation } from '../diff/types';

export type MigrationDialect = 'postgres' | 'mysql';

export interface Statement {
  readonly sql: string;
  /** `op-<n>`: the operation's index in the operation list the statement was generated from. */
  readonly operationId: string;
  /** Every operation this statement implements (MySQL merges column changes into one MODIFY). */
  readonly operationIds: readonly string[];
  /** False when the statement must run outside a transaction block (or the dialect has none). */
  readonly transactional: boolean;
  /**
   * Where a runner executes it: `before` / `after` the migration's transaction block, or in
   * `main` order (inside the block on Postgres; MySQL has no block, so everything is `main`).
   */
  readonly phase: 'before' | 'main' | 'after';
  /** True when it can delete data (drops, type conversions, removed enum values). */
  readonly destructive: boolean;
  /** Shown above the statement: why it is outside the transaction, or what cannot be undone. */
  readonly comment?: string;
}

export interface SqlMigration {
  readonly up: string;
  readonly down: string;
  readonly statements: readonly Statement[];
  readonly downStatements: readonly Statement[];
  /** The inverse operations `down` was generated from (`downStatements` refer to these). */
  readonly downOperations: readonly Operation[];
  /** Operations whose data loss the down migration cannot undo. */
  readonly irreversible: number;
  readonly warnings: readonly DiffWarning[];
}

export interface SqlOptions {
  /** Timestamp for file headers; defaults to now. */
  readonly now?: Date;
  /**
   * Postgres: create and drop non-unique indexes on existing tables `CONCURRENTLY` (outside
   * the transaction), so writes are not blocked. Default true.
   */
  readonly concurrentIndexes?: boolean;
}

export interface MigrationFile {
  readonly path: string;
  readonly contents: string;
}

export interface DrizzleJournal {
  readonly version: string;
  readonly dialect: 'postgresql' | 'mysql';
  readonly entries: readonly {
    readonly idx: number;
    readonly version: string;
    readonly when: number;
    readonly tag: string;
    readonly breakpoints: boolean;
  }[];
}

export interface FrameworkOptions {
  /** Migration name; turned into snake_case. */
  readonly name: string;
  readonly now?: Date;
}

export interface DrizzleOptions extends FrameworkOptions {
  /** The project's current `meta/_journal.json`, so the new entry continues its numbering. */
  readonly journal?: DrizzleJournal;
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}
