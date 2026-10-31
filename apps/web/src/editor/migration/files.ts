// Migration names and file packaging.
import type { MigrationFile } from '@dashdb/core/lite';

export const MAX_MIGRATION_NAME = 60;

/** `Add user e-mail!` → `add_user_e_mail`, the form used in file and folder names. */
export function migrationSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_MIGRATION_NAME)
    .replace(/_+$/, '');
  return slug || 'migration';
}

/** The last path segment, for single-file downloads. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Zips files at their paths (the exact layout Prisma or Drizzle expects). */
export async function zipFiles(files: readonly MigrationFile[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const file of files) zip.file(file.path, file.contents);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

const GENERIC = new Set(['up.sql', 'down.sql', 'migration.sql']);

/**
 * A self-explanatory name for one file downloaded on its own: generic names (`up.sql`) get
 * their migration folder as a prefix, e.g. `20261031120000_add_email.up.sql`.
 */
export function singleFileName(path: string): string {
  const base = baseName(path);
  if (!GENERIC.has(base)) return base;
  const parts = path.split('/');
  const folder = parts.at(-2);
  return folder ? `${folder}.${base}` : base;
}
