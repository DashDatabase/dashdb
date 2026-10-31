import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as lite from './lite';
import * as full from '.';

const HEAVY = [
  'node-sql-parser',
  'pgsql-ast-parser',
  '@dbml/core',
  '@mrleebo/prisma-ast',
  'prettier',
];

/** A value (non-type) import or re-export; test-only, over this package's own sources. */
// eslint-disable-next-line security/detect-unsafe-regex
const IMPORT = /^(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;

// eslint-disable-next-line security/detect-non-literal-fs-filename -- this package's sources
const exists = (path: string) => existsSync(path);

/** Packages reachable from `entry` through value (non-type) imports. */
function reachablePackages(entry: string): Set<string> {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- walks this package's own sources
    const source = readFileSync(file, 'utf8');
    const imports = source.matchAll(IMPORT);
    for (const [, target = ''] of imports) {
      if (!target.startsWith('.')) {
        packages.add(
          target.startsWith('@')
            ? target.split('/').slice(0, 2).join('/')
            : (target.split('/')[0] ?? target),
        );
        continue;
      }
      const base = resolve(dirname(file), target);
      const found = [`${base}.ts`, join(base, 'index.ts')].find(exists);
      if (found) visit(found);
    }
  };
  visit(entry);
  return packages;
}

describe('@dashdb/core/lite', () => {
  it('reaches no parser or formatter dependency', () => {
    const packages = reachablePackages(join(import.meta.dirname, 'lite.ts'));
    for (const heavy of HEAVY) expect(packages, heavy).not.toContain(heavy);
    expect([...packages].sort()).toEqual(['nanoid', 'zod']);
  });

  it('exports the same IR functions as the root entry', () => {
    for (const [name, value] of Object.entries(lite)) {
      expect(full[name as keyof typeof full], name).toBe(value);
    }
    expect(lite).toHaveProperty('createSchema');
    expect(lite).toHaveProperty('validateSchema');
    expect(lite).not.toHaveProperty('parsePostgresDDL');
    expect(lite).not.toHaveProperty('diffSchemas');
  });
});
