import { describe, expect, it } from 'vitest';
import { parseConnectionUrl } from './index';

describe('parseConnectionUrl', () => {
  it('parses a postgres URL and drops credentials', () => {
    expect(parseConnectionUrl('postgresql://u:secret@db.local:6543/app')).toEqual({
      dialect: 'postgres',
      host: 'db.local',
      port: 6543,
      database: 'app',
    });
  });

  it('falls back to the default MySQL port', () => {
    expect(parseConnectionUrl('mysql://root@localhost/sample').port).toBe(3306);
  });

  it('rejects unsupported protocols', () => {
    expect(() => parseConnectionUrl('oracle://localhost/x')).toThrow();
  });

  it('requires a database name', () => {
    expect(() => parseConnectionUrl('postgres://localhost')).toThrow(/database name/);
  });
});
