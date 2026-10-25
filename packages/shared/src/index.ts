import { z } from 'zod';

/** Database engines DashDB can connect to. */
export const DB_DIALECTS = ['postgres', 'mysql'] as const;
export const dbDialectSchema = z.enum(DB_DIALECTS);
export type DbDialect = z.infer<typeof dbDialectSchema>;

/** Response body of `GET /health` on the API. */
export const healthResponseSchema = z.object({ ok: z.literal(true) });
export type HealthResponse = z.infer<typeof healthResponseSchema>;
