import { DB_DIALECTS } from '@dashdb/shared';
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const dbDialect = pgEnum('db_dialect', DB_DIALECTS);

/** Saved connections to user databases. Secrets are stored elsewhere, never in this table. */
export const connections = pgTable('connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  dialect: dbDialect('dialect').notNull(),
  host: text('host').notNull(),
  database: text('database').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;

/** Emails from the marketing site's waitlist / newsletter form. One row per address. */
export const waitlistSignups = pgTable('waitlist_signups', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Lowercased and trimmed before insert, so the unique constraint catches duplicates. */
  email: text('email').notNull().unique(),
  /** The page the form was on, e.g. `/pricing`. */
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WaitlistSignup = typeof waitlistSignups.$inferSelect;
export type NewWaitlistSignup = typeof waitlistSignups.$inferInsert;
