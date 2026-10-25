import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { connections, dbDialect } from './schema';

describe('schema', () => {
  it('names the connections table', () => {
    expect(getTableName(connections)).toBe('connections');
  });

  it('mirrors the shared dialect list', () => {
    expect(dbDialect.enumValues).toEqual(['postgres', 'mysql']);
  });
});
