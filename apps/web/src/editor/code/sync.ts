// Code → canvas: turning a parse into a schema change (or a list of problems), as pure functions.
import { mergeSchema, type Diagnostic, type ParseResult, type Schema } from '@dashdb/core/lite';
import type { ParseOutcome } from './parse-client';
import { PARSE_TIMEOUT_MS } from './parse-client';

export type CodeApplyResult =
  /** Errors in the code: show them and leave the canvas alone. */
  | { readonly kind: 'invalid'; readonly diagnostics: readonly Diagnostic[] }
  /** The code means the same schema as the canvas. */
  | { readonly kind: 'unchanged'; readonly diagnostics: readonly Diagnostic[] }
  | {
      readonly kind: 'changed';
      readonly schema: Schema;
      readonly diagnostics: readonly Diagnostic[];
    };

const DIALECT_NAMES: Record<Schema['dialect'], string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite',
};

function problem(message: string): Diagnostic {
  return { severity: 'error', code: 'invalid-input', message, line: 1, column: 1 };
}

/** Merges a successful parse into `current`, keeping ids (and so the layout) by name. */
export function applyParsed(
  current: Schema,
  result: ParseResult,
  base: Schema | null,
): CodeApplyResult {
  const { diagnostics } = result;
  if (diagnostics.some((d) => d.severity === 'error')) return { kind: 'invalid', diagnostics };
  if (result.schema.dialect !== current.dialect) {
    const message =
      `This project uses ${DIALECT_NAMES[current.dialect]}, but the code describes a ` +
      `${DIALECT_NAMES[result.schema.dialect]} schema. Change the database in the project, not here.`;
    return { kind: 'invalid', diagnostics: [problem(message), ...diagnostics] };
  }
  const schema = mergeSchema(current, result.schema, { base });
  return schema === current
    ? { kind: 'unchanged', diagnostics }
    : { kind: 'changed', schema, diagnostics };
}

/** What a finished parse means for the canvas; `null` when it was superseded. */
export function resolveOutcome(current: Schema, outcome: ParseOutcome): CodeApplyResult | null {
  switch (outcome.kind) {
    case 'cancelled':
      return null;
    case 'timeout':
      return {
        kind: 'invalid',
        diagnostics: [
          problem(
            `Parsing took longer than ${String(PARSE_TIMEOUT_MS / 1000)} s and was stopped. ` +
              'The canvas was not changed.',
          ),
        ],
      };
    case 'failed':
      return { kind: 'invalid', diagnostics: [problem(`The parser failed: ${outcome.message}`)] };
    case 'parsed':
      return applyParsed(current, outcome.result, outcome.base);
  }
}

export interface MarkerData {
  readonly severity: Diagnostic['severity'];
  readonly message: string;
  readonly code: string;
  readonly startLineNumber: number;
  readonly startColumn: number;
  readonly endLineNumber: number;
  readonly endColumn: number;
}

/**
 * Editor markers for diagnostics. A diagnostic marks a point, so the marker runs to the end of
 * the word there (or the rest of the line), clamped to the document.
 */
export function toMarkers(diagnostics: readonly Diagnostic[], text: string): MarkerData[] {
  const lines = text.split('\n');
  return diagnostics.map((d) => {
    const lineNumber = Math.min(Math.max(1, d.line), Math.max(1, lines.length));
    const line = lines[lineNumber - 1] ?? '';
    const startColumn = Math.min(Math.max(1, d.column), line.length + 1);
    const word = /^[\w$."`]+/.exec(line.slice(startColumn - 1))?.[0].length ?? 0;
    const endColumn = word > 0 ? startColumn + word : Math.max(startColumn + 1, line.length + 1);
    return {
      severity: d.severity,
      message: d.message,
      code: d.code,
      startLineNumber: lineNumber,
      startColumn,
      endLineNumber: lineNumber,
      endColumn,
    };
  });
}
