// Import/export formats, mapped onto the @dashdb/core parsers and serializers. Those carry
// large dependencies (SQL grammars, DBML, Prettier), so they load on first use.
import type { ParseResult, Schema, SerializeResult } from '@dashdb/core/lite';

const loadParsers = () => import('@dashdb/core/parsers');
const loadSerializers = () => import('@dashdb/core/serializers');

/** Schema source files offered by import pickers. */
export const IMPORT_ACCEPT = '.sql,.prisma,.dbml,.txt';
/** Pickers that also take full project files (`.dashdb.json`). */
export const PROJECT_IMPORT_ACCEPT = `${IMPORT_ACCEPT},.json`;
/** Files beyond this are rejected before reading; the parsers cap input at 2 MB as well. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export const IMPORT_FORMATS = {
  postgres: { label: 'PostgreSQL DDL', parser: 'parsePostgresDDL' },
  mysql: { label: 'MySQL DDL', parser: 'parseMySQLDDL' },
  prisma: { label: 'Prisma schema', parser: 'parsePrisma' },
  dbml: { label: 'DBML', parser: 'parseDBML' },
} as const;
export type ImportFormat = keyof typeof IMPORT_FORMATS;

export const EXPORT_FORMATS = {
  postgres: { label: 'PostgreSQL DDL', extension: 'sql', serializer: 'toPostgresDDL' },
  mysql: { label: 'MySQL DDL', extension: 'sql', serializer: 'toMySQLDDL' },
  prisma: { label: 'Prisma schema', extension: 'prisma', serializer: 'toPrisma' },
  drizzle: { label: 'Drizzle (TypeScript)', extension: 'ts', serializer: 'toDrizzle' },
  dbml: { label: 'DBML', extension: 'dbml', serializer: 'toDBML' },
} as const;
export type ExportFormat = keyof typeof EXPORT_FORMATS;

export function isImportFormat(value: string): value is ImportFormat {
  return Object.hasOwn(IMPORT_FORMATS, value);
}

export function isExportFormat(value: string): value is ExportFormat {
  return Object.hasOwn(EXPORT_FORMATS, value);
}

// Signals that only one dialect writes. Each kind counts once.
const MYSQL_SIGNALS = [
  /`/,
  /\bENGINE\s*=/i,
  /\bAUTO_INCREMENT\b/i,
  /\bUNSIGNED\b/i,
  /\b(TINYINT|MEDIUMINT|MEDIUMTEXT|LONGTEXT|DATETIME)\b/i,
  /\bDEFAULT\s+CHARSET\b/i,
  /\bON\s+UPDATE\s+CURRENT_TIMESTAMP\b/i,
  /\bENUM\s*\(/i,
];
const POSTGRES_SIGNALS = [
  /::\s*[a-z]/i,
  /\b(BIG)?SERIAL\b/i,
  /\bGENERATED\s+(ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i,
  // Bounded, so text full of "CREATE TYPE" without semicolons cannot backtrack quadratically.
  /\bCREATE\s+TYPE\s[^;]{0,200}?\bAS\s+ENUM\b/i,
  /\bCOMMENT\s+ON\b/i,
  /\b(TIMESTAMPTZ|JSONB|BYTEA|UUID)\b/i,
  /\bCREATE\s+(SCHEMA|EXTENSION)\b/i,
  /\$\$/,
];

/**
 * Detection runs on every keystroke and on files from anywhere, so it reads only the start:
 * a dialect shows itself in the first statements.
 */
const DETECT_SCAN_CHARS = 64 * 1024;

/** The SQL dialect a script is written in: MySQL when its signals outnumber Postgres's. */
export function detectSqlDialect(text: string): 'postgres' | 'mysql' {
  const head = text.slice(0, DETECT_SCAN_CHARS);
  const score = (signals: readonly RegExp[]) => signals.filter((re) => re.test(head)).length;
  return score(MYSQL_SIGNALS) > score(POSTGRES_SIGNALS) ? 'mysql' : 'postgres';
}

/** Guesses the format of pasted schema source from its contents. */
export function detectPastedFormat(text: string): ImportFormat {
  const head = text.slice(0, DETECT_SCAN_CHARS);
  // Indentation is matched with [ \t]*, not \s*, which would rescan every following line.
  if (/^[ \t]*(datasource|generator|model)[ \t]+\w+[ \t]*\{/m.test(head)) return 'prisma';
  if (
    /^[ \t]*(Table|Ref|Enum|Project)\b[^\n;]{0,200}[{:]/m.test(head) &&
    !/\bCREATE\s+TABLE\b/i.test(head)
  )
    return 'dbml';
  return detectSqlDialect(head);
}

/** Guesses the format of an imported file from its name, then its contents. */
export function detectImportFormat(fileName: string, text: string): ImportFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.prisma')) return 'prisma';
  if (lower.endsWith('.dbml')) return 'dbml';
  if (lower.endsWith('.sql')) return detectSqlDialect(text);
  return detectPastedFormat(text);
}

export async function importSchema(format: ImportFormat, text: string): Promise<ParseResult> {
  const parsers = await loadParsers();
  return parsers[IMPORT_FORMATS[format].parser](text);
}

export async function exportSchema(format: ExportFormat, schema: Schema): Promise<SerializeResult> {
  const serializers = await loadSerializers();
  return serializers[EXPORT_FORMATS[format].serializer](schema);
}

/** The export format matching the schema's own dialect. */
export function defaultExportFormat(schema: Schema): ExportFormat {
  return schema.dialect === 'mysql' ? 'mysql' : 'postgres';
}

/** A filesystem-safe base name, e.g. `my-shop` for "My Shop!". */
export function fileSlug(projectName: string): string {
  return (
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'schema'
  );
}

/** A filesystem-safe file name for an export, e.g. `my-shop.prisma`. */
export function exportFileName(projectName: string, format: ExportFormat): string {
  return `${fileSlug(projectName)}.${EXPORT_FORMATS[format].extension}`;
}
