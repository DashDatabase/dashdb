import 'server-only';
import { createDb, waitlistSignups } from '@dashdb/db';

/** Somewhere a waitlist signup is kept. `add` resolves once stored (duplicates are fine). */
export interface SubscriberStore {
  readonly name: string;
  add(email: string, source: string): Promise<void>;
}

export interface WaitlistEnv {
  readonly DATABASE_URL?: string;
  readonly RESEND_API_KEY?: string;
  readonly RESEND_AUDIENCE_ID?: string;
}

/** Postgres via `@dashdb/db`; the unique email column makes repeat signups a no-op. */
export function postgresStore(databaseUrl: string): SubscriberStore {
  let client: ReturnType<typeof createDb> | undefined;
  return {
    name: 'postgres',
    async add(email, source) {
      client ??= createDb(databaseUrl);
      await client.db
        .insert(waitlistSignups)
        .values({ email, source })
        .onConflictDoNothing({ target: waitlistSignups.email });
    },
  };
}

const AUDIENCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A Resend audience (contacts API, plain fetch). */
export function resendStore(
  apiKey: string,
  audienceId: string,
  fetcher: typeof fetch = fetch,
): SubscriberStore {
  if (!AUDIENCE_ID.test(audienceId)) throw new Error('RESEND_AUDIENCE_ID must be a UUID');
  return {
    name: 'resend',
    async add(email) {
      const response = await fetcher(`https://api.resend.com/audiences/${audienceId}/contacts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, unsubscribed: false }),
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Resend responded ${String(response.status)}`);
    },
  };
}

/** The stores configured by environment variables (none in a fresh checkout). */
export function storesFromEnv(env: WaitlistEnv): SubscriberStore[] {
  const stores: SubscriberStore[] = [];
  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl) stores.push(postgresStore(databaseUrl));
  const apiKey = env.RESEND_API_KEY?.trim();
  const audienceId = env.RESEND_AUDIENCE_ID?.trim();
  if (apiKey && audienceId) stores.push(resendStore(apiKey, audienceId));
  return stores;
}

export type SaveResult = 'saved' | 'failed' | 'unconfigured';

/**
 * Adds the signup to every store; 'saved' if at least one kept it. Failures are logged by
 * store name only, never with the address.
 */
export async function saveSignup(
  stores: readonly SubscriberStore[],
  email: string,
  source: string,
): Promise<SaveResult> {
  if (stores.length === 0) return 'unconfigured';
  const results = await Promise.allSettled(stores.map((store) => store.add(email, source)));
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`[waitlist] ${stores[i]?.name ?? 'store'} failed:`, String(result.reason));
    }
  });
  return results.some((r) => r.status === 'fulfilled') ? 'saved' : 'failed';
}
