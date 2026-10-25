import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export * from './schema';
export { schema };

/** Create a Drizzle client for DashDB's own Postgres metadata database. */
export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl);
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export type Database = ReturnType<typeof createDb>['db'];
