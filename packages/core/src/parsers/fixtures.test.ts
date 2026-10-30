import { readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateSchema } from '../ir/schema';
import { parseDBML, parseIntrospectionJSON, parseMySQLDDL, parsePostgresDDL, parsePrisma } from '.';
import type { ParseOptions, ParseResult } from './types';

/*
 * Every fixture's full parse result is stored as a reviewed JSON snapshot in __snapshots__.
 * Ids are the readable hints finalize() produces (`column:public.users.email`), so a snapshot
 * reads as the schema it describes. After an intended parser change, regenerate with
 * `vitest run -u` and review the diff.
 */

const FIXTURES = join(import.meta.dirname, '__fixtures__');
const SNAPSHOTS = join(import.meta.dirname, '__snapshots__');
const options: ParseOptions = { createId: (hint) => hint };

const PARSERS: Record<string, (source: string, file: string) => ParseResult> = {
  postgres: (source) => parsePostgresDDL(source, options),
  mysql: (source) => parseMySQLDDL(source, options),
  prisma: (source) => parsePrisma(source, options),
  dbml: (source) => parseDBML(source, options),
  introspection: (source, file) =>
    parseIntrospectionJSON(source, file.startsWith('mysql-') ? 'mysql' : 'postgres', options),
};

// Paths below are built from this directory and the fixture listing, never from outside input.
const fixtures = Object.keys(PARSERS).flatMap((format) =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  readdirSync(join(FIXTURES, format)).map((file) => ({ format, file })),
);

describe('parser fixtures', () => {
  it('covers at least 15 real-world schemas', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(15);
  });

  it.each(fixtures)('$format/$file', async ({ format, file }) => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const source = readFileSync(join(FIXTURES, format, file), 'utf8');
    const result = (PARSERS[format] as (typeof PARSERS)[string])(source, file);

    // The IR a parser emits is always structurally valid; semantic issues are diagnostics.
    expect(validateSchema(result.schema).filter((p) => p.code === 'invalid-shape')).toEqual([]);

    const name = basename(file, extname(file));
    await expect(`${JSON.stringify(result, null, 2)}\n`).toMatchFileSnapshot(
      join(SNAPSHOTS, format, `${name}.ir.json`),
    );
  });
});
