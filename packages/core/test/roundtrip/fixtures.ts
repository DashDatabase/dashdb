import { describe, expect, it } from 'vitest';
import type { MigrationDialect } from '../../src/migrations/types';
import { loadCases, pastedQueryCase, roundTrip } from './pipeline';

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

/** Every fixture case of a dialect: the pasted introspection query output parses to after.sql. */
export function pastedQuerySuite(dialect: MigrationDialect): void {
  describe.concurrent(`${dialect} introspection query output`, () => {
    const cases = loadCases(dialect);
    it('has fixture cases', () => {
      expect(cases.length).toBeGreaterThan(0);
    });
    for (const c of cases) {
      it(`${c.name}: ${c.meta.description}`, () => pastedQueryCase(c));
    }
  });
}
