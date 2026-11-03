import { z } from 'zod';

/** Database engines DashDB can connect to. */
export const DB_DIALECTS = ['postgres', 'mysql'] as const;
export const dbDialectSchema = z.enum(DB_DIALECTS);
export type DbDialect = z.infer<typeof dbDialectSchema>;
