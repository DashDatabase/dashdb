import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOW, mysqlScenario, postgresScenario } from './__test-utils__/scenarios';
import { generateFileBundle } from './bundle';
import { generateDrizzleMigration, generatePrismaMigration } from './frameworks';
import { generateSQL } from './sql';
import type { MigrationFile } from './types';

/*
 * Golden files for every generator, reviewed like the parser snapshots. After an intended
 * change, regenerate with `vitest run -u` and review the diff in src/migrations/__golden__.
 */

const GOLDEN = join(import.meta.dirname, '__golden__');

async function expectFiles(folder: string, files: readonly MigrationFile[]): Promise<void> {
  for (const file of files) {
    await expect(file.contents).toMatchFileSnapshot(join(GOLDEN, folder, file.path));
  }
}

describe('golden files', () => {
  it.each([
    ['postgres', postgresScenario],
    ['mysql', mysqlScenario],
  ] as const)('generateSQL: %s', async (dialect, scenario) => {
    const sql = generateSQL(scenario.diff, dialect, { now: NOW });
    await expectFiles('sql', [
      { path: `${dialect}.up.sql`, contents: sql.up },
      { path: `${dialect}.down.sql`, contents: sql.down },
    ]);
  });

  it.each([
    ['postgres', postgresScenario],
    ['mysql', mysqlScenario],
  ] as const)('generatePrismaMigration: %s', async (dialect, scenario) => {
    await expectFiles(
      `prisma-${dialect}`,
      generatePrismaMigration(scenario.diff, scenario.after, { name: scenario.name, now: NOW }),
    );
  });

  it.each([
    ['postgres', postgresScenario],
    ['mysql', mysqlScenario],
  ] as const)('generateDrizzleMigration: %s', async (dialect, scenario) => {
    await expectFiles(
      `drizzle-${dialect}`,
      await generateDrizzleMigration(scenario.diff, scenario.after, {
        name: scenario.name,
        now: NOW,
      }),
    );
  });

  it('generateDrizzleMigration appends to an existing journal', async () => {
    const files = await generateDrizzleMigration(postgresScenario.diff, postgresScenario.after, {
      name: 'second step',
      now: NOW,
      journal: {
        version: '7',
        dialect: 'postgresql',
        entries: [
          {
            idx: 0,
            version: '7',
            when: 1792937859017,
            tag: '0000_brainy_magma',
            breakpoints: true,
          },
        ],
      },
    });
    expect(files.map((f) => f.path)).toContain('drizzle/0001_second_step.sql');
    await expectFiles(
      'drizzle-append',
      files.filter((f) => f.path.endsWith('_journal.json')),
    );
  });

  it('generateFileBundle: every target', async () => {
    const files = await generateFileBundle({
      diff: postgresScenario.diff,
      after: postgresScenario.after,
      targets: ['sql', 'prisma', 'drizzle'],
      name: postgresScenario.name,
      now: NOW,
    });
    expect(files.map((f) => f.path)).toEqual([
      'drizzle/0000_grow_the_blog.down.sql',
      'drizzle/0000_grow_the_blog.sql',
      'drizzle/meta/_journal.json',
      'drizzle/schema.ts',
      'migrations/20261030120000_grow_the_blog/down.sql',
      'migrations/20261030120000_grow_the_blog/up.sql',
      'prisma/migrations/20261030120000_grow_the_blog/down.sql',
      'prisma/migrations/20261030120000_grow_the_blog/migration.sql',
      'prisma/migrations/migration_lock.toml',
      'prisma/schema.prisma',
    ]);
    await expectFiles('bundle', files);
  });
});
