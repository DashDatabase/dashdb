import type { HealthResponse } from '@dashdb/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

export const app = new Hono()
  .use('*', cors({ origin: webOrigin }))
  .get('/health', (c) => c.json({ ok: true } as const satisfies HealthResponse));

/** Route types for the typed RPC client in `@dashdb/api-client`. */
export type AppType = typeof app;
