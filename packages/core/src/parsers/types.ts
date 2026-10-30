import type { Schema } from '../ir/types';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
  | 'input-too-large'
  | 'syntax-error'
  | 'unsupported-statement'
  | 'unsupported-feature'
  | 'unresolved-reference'
  | 'duplicate-definition'
  | 'unknown-type'
  | 'invalid-input'
  | `ir-${string}`;

export interface SourceLocation {
  /** 1-based line. */
  readonly line: number;
  /** 1-based column, in UTF-16 code units. */
  readonly column: number;
}

export interface Diagnostic extends SourceLocation {
  readonly severity: DiagnosticSeverity;
  readonly code: DiagnosticCode;
  readonly message: string;
}

export interface ParseResult {
  readonly schema: Schema;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ParseOptions {
  /**
   * Id factory for IR elements. `hint` is a readable, element-unique path such as
   * `column:public.users.email`; the default ignores it and returns a nanoid.
   */
  readonly createId?: (hint: string) => string;
}

/** Inputs larger than this (UTF-8 bytes) are rejected without parsing. */
export const MAX_INPUT_BYTES = 2 * 1024 * 1024;
