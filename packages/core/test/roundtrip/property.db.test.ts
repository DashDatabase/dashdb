import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import type { MigrationDialect } from '../../src/migrations/types';
import { caseArb, type GeneratedCase } from './arbitraries';
import { FIXTURES, roundTrip, type Meta } from './pipeline';

/*
 * Random schema + random edit sequence must round-trip. Every failing case is saved as a
 * fixture case (fixtures/migrations/<pg|my>-prop-<seed>/), overwritten as fast-check shrinks
 * it, so the smallest failure found so far survives even if shrinking runs out of time.
 * FC_SEED and FC_RUNS override the fixed CI defaults.
 */

const SEED = Number(process.env.FC_SEED ?? 20261030);
const RUNS = Number(process.env.FC_RUNS ?? 25);
/** Stop generating and shrinking after this long, so the test reports instead of timing out. */
const TIME_LIMIT = 240_000;

function saveFixture(dialect: MigrationDialect, c: GeneratedCase, error: unknown): string {
  const dir = join(FIXTURES, `${dialect === 'postgres' ? 'pg' : 'my'}-prop-${String(SEED)}`);
  /* eslint-disable security/detect-non-literal-fs-filename -- a folder under fixtures/ */
  mkdirSync(dir, { recursive: true });
  const meta: Meta = {
    dialect,
    description: `property-test counterexample (seed ${String(SEED)}): ${String(error).split('\n')[0] ?? ''}`,
    ...(c.renames.length ? { renames: c.renames } : {}),
  };
  writeFileSync(join(dir, 'before.sql'), `${c.before}\n`);
  writeFileSync(join(dir, 'after.sql'), `${c.after}\n`);
  writeFileSync(join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  /* eslint-enable security/detect-non-literal-fs-filename */
  return dir;
}

for (const dialect of ['postgres', 'mysql'] as const) {
  describe(`${dialect} property`, () => {
    it(
      `random schemas and edit sequences round-trip (seed ${String(SEED)}, ${String(RUNS)} runs)`,
      async () => {
        let n = 0;
        const failure: { dir: string | null } = { dir: null };
        const result = await fc.check(
          fc.asyncProperty(caseArb(dialect), async (c) => {
            try {
              await roundTrip({
                name: `prop_${String(++n)}`,
                before: c.before,
                after: c.after,
                meta: { dialect, description: 'property', renames: c.renames },
              });
            } catch (error) {
              // Shrinking only retries smaller cases, so the latest failure is the smallest.
              failure.dir = saveFixture(dialect, c, error);
              throw error;
            }
          }),
          { seed: SEED, numRuns: RUNS, interruptAfterTimeLimit: TIME_LIMIT },
        );
        if (failure.dir !== null) {
          throw new Error(
            `Round trip failed for a generated case (seed ${String(SEED)}, path ${String(result.counterexamplePath)}); ` +
              `the smallest failure is saved as ${failure.dir}. Fix the bug, rename the folder and commit it.\n` +
              String(result.errorInstance),
          );
        }
      },
      TIME_LIMIT + 60_000,
    );
  });
}
