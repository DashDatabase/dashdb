// Integration test against a real Postgres. Run with `pnpm test:db` after `docker compose up -d`.
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from './index';

const { db, close } = createDb(
  process.env.DATABASE_URL ?? 'postgres://dashdb:dashdb@localhost:5432/dashdb',
);

afterAll(async () => {
  await close();
});

describe('postgres connection', () => {
  it('runs a query', async () => {
    const rows = await db.execute<{ one: number }>(sql`select 1 as one`);
    expect(rows[0]?.one).toBe(1);
  });
});
