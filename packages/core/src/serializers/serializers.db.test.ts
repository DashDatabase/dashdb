/* eslint-disable security/detect-non-literal-fs-filename -- every path is inside this test's own temp directory */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, extname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadFixtures } from './__test-utils__/fixtures';
import { toDrizzle, toPrisma } from '.';

/*
 * Acceptance: generated Prisma passes `prisma validate` and generated Drizzle compiles with
 * `tsc`, for every P05 fixture. These shell out to the real CLIs, so they run in the db-tests
 * CI job (`pnpm test:db`) rather than the unit suite. Files go under node_modules/.cache so
 * `drizzle-orm` resolves from them.
 */

const require = createRequire(import.meta.url);
const PRISMA_CLI = require.resolve('prisma/build/index.js');
const TSC = require.resolve('typescript/bin/tsc');

const cache = join(import.meta.dirname, '..', '..', 'node_modules', '.cache', 'dashdb-serializers');
mkdirSync(cache, { recursive: true });
const workDir = mkdtempSync(join(cache, 'run-'));
afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const fixtures = loadFixtures();
const slug = (format: string, file: string) => `${format}-${basename(file, extname(file))}`;

function run(command: string, args: string[]): { ok: boolean; output: string } {
  try {
    const output = execFileSync(process.execPath, [command, ...args], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { ok: true, output };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('prisma validate', () => {
  it.each(fixtures)('$format/$file', ({ format, file, schema }) => {
    const path = join(workDir, `${slug(format, file)}.prisma`);
    writeFileSync(path, toPrisma(schema).code);
    const result = run(PRISMA_CLI, ['validate', '--schema', path]);
    expect(result.ok, result.output).toBe(true);
  });
});

describe('drizzle compiles with tsc', () => {
  it('type-checks the Drizzle schema of every postgres and mysql fixture', async () => {
    const dir = join(workDir, 'drizzle');
    mkdirSync(dir);
    let files = 0;
    for (const { format, file, schema } of fixtures) {
      if (schema.dialect === 'sqlite') continue;
      writeFileSync(join(dir, `${slug(format, file)}.ts`), (await toDrizzle(schema)).code);
      files++;
    }
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          skipLibCheck: true,
          types: [],
        },
        include: ['*.ts'],
      }),
    );
    expect(files).toBe(16);
    const result = run(TSC, ['-p', join(dir, 'tsconfig.json')]);
    expect(result.ok, result.output).toBe(true);
  });
});
