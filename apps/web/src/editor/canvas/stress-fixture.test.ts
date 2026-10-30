import { validateSchema } from '@dashdb/core';
import { describe, expect, it } from 'vitest';
import { STRESS_TABLE_COUNT, stressSchema } from './stress-fixture';

describe('stress fixture', () => {
  it('builds a valid, deterministic 500-table schema with relationships', () => {
    const schema = stressSchema();
    expect(schema.tables).toHaveLength(STRESS_TABLE_COUNT);
    const fks = schema.tables.reduce((n, t) => n + t.foreignKeys.length, 0);
    expect(fks).toBeGreaterThan(400);
    expect(validateSchema(schema)).toEqual([]);
    const again = stressSchema();
    expect(again.tables.map((t) => t.columns.length)).toEqual(
      schema.tables.map((t) => t.columns.length),
    );
  });
});
