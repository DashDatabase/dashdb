import { describe, expect, it } from 'vitest';
import { dbDialectSchema, healthResponseSchema } from './index';

describe('healthResponseSchema', () => {
  it('accepts { ok: true }', () => {
    expect(healthResponseSchema.parse({ ok: true })).toEqual({ ok: true });
  });

  it('rejects { ok: false }', () => {
    expect(healthResponseSchema.safeParse({ ok: false }).success).toBe(false);
  });
});

describe('dbDialectSchema', () => {
  it('rejects unknown dialects', () => {
    expect(dbDialectSchema.safeParse('oracle').success).toBe(false);
  });
});
