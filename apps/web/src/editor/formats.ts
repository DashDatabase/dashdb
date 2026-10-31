// Import/export formats, mapped onto the @dashdb/core parsers and serializers. Those carry
// large dependencies (SQL grammars, DBML, Prettier), so they load on first use.
import {
  detectSourceFormat,
  detectSqlDialect,
  type ParseResult,
  type Schema,
  type SerializeResult,
} from '@dashdb/core/lite';

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

// Detection lives in @dashdb/core (the converter tools share it); the import dialog calls it
// on pasted text, so it keeps its name here.
export { detectSqlDialect, detectSourceFormat as detectPastedFormat } from '@dashdb/core/lite';

/** Guesses the format of an imported file from its name, then its contents. */
export function detectImportFormat(fileName: string, text: string): ImportFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.prisma')) return 'prisma';
  if (lower.endsWith('.dbml')) return 'dbml';
  if (lower.endsWith('.sql')) return detectSqlDialect(text);
  return detectSourceFormat(text);
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
