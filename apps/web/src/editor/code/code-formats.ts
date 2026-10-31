// Formats offered by the Code panel, resolved against the project's dialect.
import type { IrDialect } from '@dashdb/core/lite';
import { EXPORT_FORMATS, type ExportFormat, type ImportFormat } from '../formats';

export const CODE_FORMATS = ['sql', 'prisma', 'drizzle', 'dbml'] as const;
export type CodeFormat = (typeof CODE_FORMATS)[number];

export function isCodeFormat(value: string): value is CodeFormat {
  return (CODE_FORMATS as readonly string[]).includes(value);
}

export interface ResolvedCodeFormat {
  readonly label: string;
  /** Serializer used for canvas → code. */
  readonly exportFormat: ExportFormat;
  /** Parser used for code → canvas; `null` makes the editor read-only. */
  readonly parser: ImportFormat | null;
  /** Monaco language id. */
  readonly language: string;
  readonly extension: string;
  /** Why the format is read-only, shown in the panel. */
  readonly readOnlyReason: string | null;
}

export function resolveCodeFormat(format: CodeFormat, dialect: IrDialect): ResolvedCodeFormat {
  switch (format) {
    case 'sql': {
      const exportFormat = dialect === 'mysql' ? 'mysql' : 'postgres';
      // SQLite projects are shown as PostgreSQL DDL, which can't be parsed back into SQLite.
      const editable = dialect !== 'sqlite';
      return {
        label: dialect === 'mysql' ? 'SQL (MySQL)' : 'SQL (PostgreSQL)',
        exportFormat,
        parser: editable ? exportFormat : null,
        language: exportFormat === 'mysql' ? 'mysql' : 'pgsql',
        extension: EXPORT_FORMATS[exportFormat].extension,
        readOnlyReason: editable ? null : 'SQL for SQLite projects is read-only.',
      };
    }
    case 'prisma':
      return {
        label: 'Prisma',
        exportFormat: 'prisma',
        parser: 'prisma',
        language: 'prisma',
        extension: 'prisma',
        readOnlyReason: null,
      };
    case 'drizzle':
      return {
        label: 'Drizzle',
        exportFormat: 'drizzle',
        parser: null,
        language: 'typescript',
        extension: 'ts',
        readOnlyReason: 'Drizzle is generated only; edit SQL, Prisma or DBML instead.',
      };
    case 'dbml':
      return {
        label: 'DBML',
        exportFormat: 'dbml',
        parser: 'dbml',
        language: 'dbml',
        extension: 'dbml',
        readOnlyReason: null,
      };
  }
}
