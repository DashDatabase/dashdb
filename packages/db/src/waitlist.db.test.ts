// Integration test against a real Postgres. Run with `pnpm test:db` after `docker compose up -d`
// and `pnpm db:migrate`.
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb, waitlistSignups } from './index';

const { db, close } = createDb(
  process.env.DATABASE_URL ?? 'postgres://dashdb:dashdb@localhost:5432/dashdb',
);
const email = `waitlist-test-${String(Date.now())}@example.com`;

afterAll(async () => {
  await db.delete(waitlistSignups).where(eq(waitlistSignups.email, email));
  await close();
});

describe('waitlist_signups', () => {
  it('stores a signup once, ignoring repeats', async () => {
    const add = () =>
      db
        .insert(waitlistSignups)
        .values({ email, source: '/pricing' })
        .onConflictDoNothing({ target: waitlistSignups.email });
    await add();
    await add();
    const rows = await db.select().from(waitlistSignups).where(eq(waitlistSignups.email, email));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email, source: '/pricing' });
    expect(rows[0]?.createdAt).toBeInstanceOf(Date);
  });
});
