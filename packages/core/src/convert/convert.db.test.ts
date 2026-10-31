// The converter tools' examples against real databases: each SQL example runs as written, and
// every example converted to Postgres and to MySQL runs too. Run with `pnpm test:db`.
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../test/roundtrip/db';
import { CONVERT_EXAMPLES, convert } from '.';

const examples = Object.entries(CONVERT_EXAMPLES);

async function runs(dialect: 'postgres' | 'mysql', label: string, sql: string): Promise<void> {
  const db = await openDatabase(dialect, label);
  try {
    await db.exec(sql);
    // Every table made it.
    expect((await db.introspect()).tables.length).toBeGreaterThan(0);
  } finally {
    await db.close();
  }
}

describe('converter examples on real databases', () => {
  it.each(examples.filter(([, e]) => e.format === 'postgres' || e.format === 'mysql'))(
    '%s runs as written',
    async (name, example) => {
      await runs(example.format as 'postgres' | 'mysql', `ex_${name}`, example.source);
    },
  );

  for (const target of ['postgres', 'mysql'] as const) {
    it.each(examples)(`%s converted to ${target} runs`, async (name, example) => {
      const result = await convert({ from: example.format, to: target, source: example.source });
      expect(result.ok).toBe(true);
      await runs(target, `to_${target}_${name}`, result.code);
    });
  }
});
