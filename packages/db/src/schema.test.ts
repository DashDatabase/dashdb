import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { connections, dbDialect, waitlistSignups } from './schema';

describe('schema', () => {
  it('names the connections table', () => {
    expect(getTableName(connections)).toBe('connections');
  });

  it('mirrors the shared dialect list', () => {
    expect(dbDialect.enumValues).toEqual(['postgres', 'mysql']);
  });

  it('names the waitlist table', () => {
    expect(getTableName(waitlistSignups)).toBe('waitlist_signups');
  });
});
