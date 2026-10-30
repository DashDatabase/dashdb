// Import/export formats, mapped onto the @dashdb/core parsers and serializers.
import {
  parseDBML,
  parseMySQLDDL,
  parsePostgresDDL,
  parsePrisma,
  toDBML,
  toDrizzle,
  toMySQLDDL,
  toPostgresDDL,
  toPrisma,
  type ParseResult,
  type Schema,
  type SerializeResult,
} from '@dashdb/core';

/** File types offered by import pickers. */
export const IMPORT_ACCEPT = '.sql,.prisma,.dbml,.txt';
/** The projects home also accepts full project files. */
export const PROJECT_IMPORT_ACCEPT = `${IMPORT_ACCEPT},.json`;
/** Files beyond this are rejected before reading; the parsers cap input at 2 MB as well. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export const IMPORT_FORMATS = {
  postgres: { label: 'PostgreSQL DDL', parse: parsePostgresDDL },
  mysql: { label: 'MySQL DDL', parse: parseMySQLDDL },
  prisma: { label: 'Prisma schema', parse: parsePrisma },
  dbml: { label: 'DBML', parse: parseDBML },
} as const;
export type ImportFormat = keyof typeof IMPORT_FORMATS;

export const EXPORT_FORMATS = {
  postgres: { label: 'PostgreSQL DDL', extension: 'sql', serialize: toPostgresDDL },
  mysql: { label: 'MySQL DDL', extension: 'sql', serialize: toMySQLDDL },
  prisma: { label: 'Prisma schema', extension: 'prisma', serialize: toPrisma },
  drizzle: { label: 'Drizzle (TypeScript)', extension: 'ts', serialize: toDrizzle },
  dbml: { label: 'DBML', extension: 'dbml', serialize: toDBML },
} as const;
export type ExportFormat = keyof typeof EXPORT_FORMATS;

export function isImportFormat(value: string): value is ImportFormat {
  return Object.hasOwn(IMPORT_FORMATS, value);
}

export function isExportFormat(value: string): value is ExportFormat {
  return Object.hasOwn(EXPORT_FORMATS, value);
}

/** Guesses the format of an imported file from its name, then its contents. */
export function detectImportFormat(fileName: string, text: string): ImportFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.prisma')) return 'prisma';
  if (lower.endsWith('.dbml')) return 'dbml';
  // MySQL dumps quote identifiers with backticks and declare table engines.
  if (/`|\bENGINE\s*=|\bAUTO_INCREMENT\b/i.test(text)) return 'mysql';
  return 'postgres';
}

export function importSchema(format: ImportFormat, text: string): ParseResult {
  return IMPORT_FORMATS[format].parse(text);
}

export async function exportSchema(format: ExportFormat, schema: Schema): Promise<SerializeResult> {
  return EXPORT_FORMATS[format].serialize(schema);
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
