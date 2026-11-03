import { describe, expect, it } from 'vitest';
import { dbDialectSchema } from './index';

describe('dbDialectSchema', () => {
  it('rejects unknown dialects', () => {
    expect(dbDialectSchema.safeParse('oracle').success).toBe(false);
  });
});
