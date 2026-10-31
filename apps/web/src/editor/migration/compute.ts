// Migration generation as one pure step: diff, SQL, safety analysis and files. Runs in a Web
// Worker (migration.worker.ts) so large schemas never block the editor.
import {
  analyzeMigration,
  diffSchemas,
  generateFileBundle,
  generateSQL,
  type DiffWarning,
  type MigrationFile,
  type Operation,
  type RenameCandidate,
  type SafetyReport,
  type Schema,
  type Statement,
} from '@dashdb/core';
import { isMigrationDialect, type MigrationTarget } from './targets';

export {
  MIGRATION_TARGETS,
  isMigrationDialect,
  isMigrationTarget,
  type MigrationTarget,
} from './targets';

export interface MigrationRequest {
  readonly before: Schema;
  readonly after: Schema;
  readonly target: MigrationTarget;
  readonly name: string;
  /** Rename candidate keys the user confirmed. */
  readonly confirmedRenames: readonly string[];
  /** Timestamp (ms) for file names and headers. */
  readonly now: number;
}

export interface MigrationOutput {
  readonly operations: readonly Operation[];
  readonly downOperations: readonly Operation[];
  readonly renameCandidates: readonly RenameCandidate[];
  readonly warnings: readonly DiffWarning[];
  readonly statements: readonly Statement[];
  readonly downStatements: readonly Statement[];
  readonly irreversible: number;
  readonly report: SafetyReport;
  /** Files for the target, sorted by path. */
  readonly files: readonly MigrationFile[];
  /** Paths of the up and down files within `files`. */
  readonly upPath: string;
  readonly downPath: string;
  /** Time spent generating, in milliseconds. */
  readonly durationMs: number;
}

export type MigrationResponse =
  | { readonly ok: true; readonly output: MigrationOutput }
  | { readonly ok: false; readonly message: string };

/** The up and down files of a target's bundle. */
export function migrationFilePaths(
  target: MigrationTarget,
  files: readonly MigrationFile[],
): { upPath: string; downPath: string } {
  const paths = files.map((f) => f.path);
  const find = (test: (path: string) => boolean) => paths.find(test) ?? '';
  switch (target) {
    case 'sql':
      return {
        upPath: find((p) => p.endsWith('/up.sql')),
        downPath: find((p) => p.endsWith('/down.sql')),
      };
    case 'prisma':
      return {
        upPath: find((p) => p.endsWith('/migration.sql')),
        downPath: find((p) => p.endsWith('/down.sql')),
      };
    case 'drizzle':
      return {
        upPath: find((p) => p.endsWith('.sql') && !p.endsWith('.down.sql')),
        downPath: find((p) => p.endsWith('.down.sql')),
      };
  }
}

export async function computeMigration(
  request: MigrationRequest,
  clock: () => number = () => performance.now(),
): Promise<MigrationResponse> {
  const started = clock();
  const { before, after, target } = request;
  const dialect = after.dialect;
  if (!isMigrationDialect(dialect)) {
    return { ok: false, message: 'Migrations are available for PostgreSQL and MySQL projects.' };
  }
  try {
    const diff = diffSchemas(before, after, { confirmedRenames: request.confirmedRenames });
    const now = new Date(request.now);
    // Prisma and Drizzle run each file in one script, so they never build indexes CONCURRENTLY.
    const concurrentIndexes = target === 'sql';
    const sql = generateSQL(diff, dialect, { now, concurrentIndexes });
    const report = analyzeMigration(diff, dialect, { concurrentIndexes });
    const files = await generateFileBundle({
      diff,
      after,
      targets: [target],
      name: request.name,
      now,
    });
    return {
      ok: true,
      output: {
        operations: diff.operations,
        downOperations: sql.downOperations,
        renameCandidates: diff.renameCandidates,
        warnings: diff.warnings,
        statements: sql.statements,
        downStatements: sql.downStatements,
        irreversible: sql.irreversible,
        report,
        files,
        ...migrationFilePaths(target, files),
        durationMs: Math.round(clock() - started),
      },
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
