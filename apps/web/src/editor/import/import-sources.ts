// The import dialog's three sources, as pure functions: uploaded files, and the pasted result
// of the introspection query.
import {
  INTROSPECTION_QUERIES,
  normalizeIntrospectionPaste,
  parseIntrospectionJSON,
  type IntrospectionDialect,
  type ParseResult,
} from '@dashdb/core';
import { MAX_IMPORT_BYTES, detectImportFormat, type ImportFormat } from '../formats';
import {
  MAX_PROJECT_FILE_BYTES,
  isProjectFileName,
  parseProjectFile,
  type ProjectFile,
} from '../project-file';

/** File types the Upload tab accepts. `.json` covers `.dashdb.json`. */
export const UPLOAD_ACCEPT = '.sql,.prisma,.dbml,.json,.txt';

export type UploadedFile =
  | { readonly kind: 'schema'; readonly format: ImportFormat; readonly text: string }
  | { readonly kind: 'project'; readonly file: ProjectFile }
  | { readonly kind: 'error'; readonly errors: readonly string[] };

const isJsonName = (name: string) => name.toLowerCase().endsWith('.json');

/** The size limit for a file, checked before it is read. */
export function maxUploadBytes(fileName: string): number {
  return isJsonName(fileName) ? MAX_PROJECT_FILE_BYTES : MAX_IMPORT_BYTES;
}

/** Sorts an uploaded file into schema source or a DashDB project file. Never throws. */
export function classifyUpload(fileName: string, text: string): UploadedFile {
  if (isProjectFileName(fileName) || isJsonName(fileName)) {
    const parsed = parseProjectFile(text);
    return parsed.ok
      ? { kind: 'project', file: parsed.file }
      : { kind: 'error', errors: parsed.errors };
  }
  return { kind: 'schema', format: detectImportFormat(fileName, text), text };
}

export function introspectionQuery(dialect: IntrospectionDialect): string {
  return INTROSPECTION_QUERIES[dialect].trim();
}

/** Parses the introspection query's result as copied out of the user's SQL client. */
export function importIntrospection(dialect: IntrospectionDialect, pasted: string): ParseResult {
  return parseIntrospectionJSON(normalizeIntrospectionPaste(pasted), dialect);
}
