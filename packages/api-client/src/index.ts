import type { AppType } from '@dashdb/api';
import { healthResponseSchema, type HealthResponse } from '@dashdb/shared';
import { hc } from 'hono/client';

export type ApiClient = ReturnType<typeof hc<AppType>>;

export interface ApiClientOptions {
  /** Custom fetch, e.g. for tests or server-side requests. */
  fetch?: typeof fetch;
}

/** Typed RPC client for `@dashdb/api`. Route types come from the API's `AppType`. */
export function createApiClient(baseUrl: string, options: ApiClientOptions = {}): ApiClient {
  return hc<AppType>(baseUrl, options.fetch ? { fetch: options.fetch } : {});
}

export async function getHealth(client: ApiClient): Promise<HealthResponse> {
  const res = await client.health.$get();
  if (!res.ok) {
    throw new Error(`Health check failed with HTTP ${res.status}`);
  }
  return healthResponseSchema.parse(await res.json());
}
