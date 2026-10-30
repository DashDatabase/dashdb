import { compareStrings } from '../diff/defs';
import type { DiffResult } from '../diff/types';
import type { Schema } from '../ir/types';
import { generateDrizzleMigration, generatePrismaMigration } from './frameworks';
import { compactTimestamp, snakeName } from './header';
import { generateSQL } from './sql';
import type { DrizzleJournal, MigrationDialect, MigrationFile } from './types';

export type BundleTarget = 'sql' | 'prisma' | 'drizzle';

export interface BundleInput {
  readonly diff: DiffResult;
  /** The schema after the migration (Prisma and Drizzle regenerate their schema files from it). */
  readonly after: Schema;
  readonly targets: readonly BundleTarget[];
  readonly name: string;
  readonly now?: Date;
  /** Current drizzle-kit journal, so the new migration continues its numbering. */
  readonly journal?: DrizzleJournal;
}

/** Every file for the requested targets, sorted by path, ready to zip or download. */
export async function generateFileBundle(input: BundleInput): Promise<MigrationFile[]> {
  const now = input.now ?? new Date();
  const files: MigrationFile[] = [];
  if (input.targets.includes('sql')) {
    const sql = generateSQL(input.diff, input.after.dialect as MigrationDialect, { now });
    const folder = `migrations/${compactTimestamp(now)}_${snakeName(input.name)}`;
    files.push(
      { path: `${folder}/up.sql`, contents: sql.up },
      { path: `${folder}/down.sql`, contents: sql.down },
    );
  }
  if (input.targets.includes('prisma')) {
    files.push(...generatePrismaMigration(input.diff, input.after, { name: input.name, now }));
  }
  if (input.targets.includes('drizzle')) {
    files.push(
      ...(await generateDrizzleMigration(input.diff, input.after, {
        name: input.name,
        now,
        ...(input.journal ? { journal: input.journal } : {}),
      })),
    );
  }
  return files.sort((a, b) => compareStrings(a.path, b.path));
}
