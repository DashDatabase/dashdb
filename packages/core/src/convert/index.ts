// One-call conversion between schema formats: parse the source into the Schema IR, then
// serialize it to the target. Pure and synchronous apart from Drizzle (Prettier formats it), so it
// runs anywhere, including the browser, with no server involved.
import { detectSqlDialect, type SourceFormat } from '../detect';
import type { Schema } from '../ir/types';
import { parseDBML, parseMySQLDDL, parsePostgresDDL, parsePrisma } from '../parsers';
import type { Diagnostic, ParseResult } from '../parsers/types';
import { toDBML, toDrizzle, toMermaid, toMySQLDDL, toPostgresDDL, toPrisma } from '../serializers';
import type { SerializeResult, SerializeWarning } from '../serializers/types';

export type { SourceFormat } from '../detect';
export { detectSourceFormat, detectSqlDialect } from '../detect';

/** What to read. `sql` detects Postgres or MySQL from the text. */
export type ConvertFrom = SourceFormat | 'sql';

/** What to write. `sql` is SQL in the source's own dialect (Postgres for SQLite sources). */
export type ConvertTo = 'postgres' | 'mysql' | 'prisma' | 'drizzle' | 'dbml' | 'mermaid' | 'sql';

export type TargetFormat = Exclude<ConvertTo, 'sql'>;

export interface ConvertRequest {
  readonly from: ConvertFrom;
  readonly to: ConvertTo;
  readonly source: string;
}

export interface ConvertResult {
  /** False when the source has errors; `code` is then empty rather than a partial guess. */
  readonly ok: boolean;
  readonly code: string;
  /** The format actually parsed (`sql` resolved to a dialect). */
  readonly from: SourceFormat;
  /** The format actually written (`sql` resolved to a dialect). */
  readonly to: TargetFormat;
  readonly schema: Schema;
  /** Parser findings, errors first. */
  readonly diagnostics: readonly Diagnostic[];
  /** What the target format could not express exactly. */
  readonly warnings: readonly SerializeWarning[];
}

const PARSERS: Record<SourceFormat, (source: string) => ParseResult> = {
  postgres: (source) => parsePostgresDDL(source),
  mysql: (source) => parseMySQLDDL(source),
  prisma: (source) => parsePrisma(source),
  dbml: (source) => parseDBML(source),
};

const SERIALIZERS: Record<
  TargetFormat,
  (schema: Schema) => SerializeResult | Promise<SerializeResult>
> = {
  postgres: toPostgresDDL,
  mysql: toMySQLDDL,
  prisma: toPrisma,
  drizzle: toDrizzle,
  dbml: toDBML,
  mermaid: toMermaid,
};

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

export function resolveSource(from: ConvertFrom, source: string): SourceFormat {
  return from === 'sql' ? detectSqlDialect(source) : from;
}

export function resolveTarget(to: ConvertTo, schema: Pick<Schema, 'dialect'>): TargetFormat {
  if (to !== 'sql') return to;
  return schema.dialect === 'mysql' ? 'mysql' : 'postgres';
}

export async function convert({ from, to, source }: ConvertRequest): Promise<ConvertResult> {
  const sourceFormat = resolveSource(from, source);
  const parsed = PARSERS[sourceFormat](source);
  const diagnostics = [...parsed.diagnostics].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.line - b.line,
  );
  const target = resolveTarget(to, parsed.schema);
  const base = { from: sourceFormat, to: target, schema: parsed.schema, diagnostics };
  if (diagnostics.some((d) => d.severity === 'error')) {
    return { ...base, ok: false, code: '', warnings: [] };
  }
  const { code, warnings } = await SERIALIZERS[target](parsed.schema);
  return { ...base, ok: true, code, warnings };
}
export { CONVERT_EXAMPLES, type ConvertExample, type ConvertExampleName } from './examples';
