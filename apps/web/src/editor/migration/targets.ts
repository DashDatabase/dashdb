// Migration targets and dialects: tiny, so the panel can use them without loading the
// generators (which run in the worker).
import type { MigrationDialect, Schema } from '@dashdb/core/lite';

export const MIGRATION_TARGETS = ['sql', 'prisma', 'drizzle'] as const;
export type MigrationTarget = (typeof MIGRATION_TARGETS)[number];

export function isMigrationTarget(value: string): value is MigrationTarget {
  return (MIGRATION_TARGETS as readonly string[]).includes(value);
}

export function isMigrationDialect(dialect: Schema['dialect']): dialect is MigrationDialect {
  return dialect === 'postgres' || dialect === 'mysql';
}
