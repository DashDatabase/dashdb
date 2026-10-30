import { describe, expect, it } from 'vitest';
import type { MigrationDialect } from '../../src/migrations/types';
import { loadCases, roundTrip } from './pipeline';

/** Every fixture case of a dialect: before.sql → up → down on a real database (see README.md). */
export function fixtureSuite(dialect: MigrationDialect): void {
  describe.concurrent(`${dialect} fixtures`, () => {
    const cases = loadCases(dialect);
    it('has fixture cases', () => {
      expect(cases.length).toBeGreaterThan(0);
    });
    for (const c of cases) {
      it(`${c.name}: ${c.meta.description}`, () => roundTrip(c));
    }
  });
}
