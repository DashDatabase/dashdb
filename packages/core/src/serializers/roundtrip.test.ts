import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Schema } from '../ir/types';
import {
  parseDBML,
  parseIntrospectionJSON,
  parseMySQLDDL,
  parsePostgresDDL,
  parsePrisma,
} from '../parsers';
import type { ParseResult } from '../parsers/types';
import { canonical } from './__test-utils__/canonical';
import { toDBML, toMySQLDDL, toPostgresDDL, toPrisma } from '.';
import type { SerializeResult } from './types';

/*
 * Acceptance: every P05 fixture survives a round trip through its own format —
 * parse(serialize(ir)) equals ir, ignoring ids. Introspection fixtures have no JSON serializer,
 * so they go through their dialect's SQL.
 */

const FIXTURES = join(import.meta.dirname, '..', 'parsers', '__fixtures__');

interface Format {
  parse: (source: string, file: string) => ParseResult;
  serialize: (schema: Schema) => SerializeResult;
  reparse: (code: string) => ParseResult;
}

const sql = (dialect: 'postgres' | 'mysql'): Pick<Format, 'serialize' | 'reparse'> =>
  dialect === 'postgres'
    ? { serialize: toPostgresDDL, reparse: (code) => parsePostgresDDL(code) }
    : { serialize: toMySQLDDL, reparse: (code) => parseMySQLDDL(code) };

const FORMATS: Record<string, (file: string) => Format> = {
  postgres: () => ({ parse: (s) => parsePostgresDDL(s), ...sql('postgres') }),
  mysql: () => ({ parse: (s) => parseMySQLDDL(s), ...sql('mysql') }),
  prisma: () => ({
    parse: (s) => parsePrisma(s),
    serialize: toPrisma,
    reparse: (c) => parsePrisma(c),
  }),
  dbml: () => ({ parse: (s) => parseDBML(s), serialize: toDBML, reparse: (c) => parseDBML(c) }),
  introspection: (file) => {
    const dialect = file.startsWith('mysql-') ? 'mysql' : 'postgres';
    return { parse: (s) => parseIntrospectionJSON(s, dialect), ...sql(dialect) };
  },
};

const fixtures = Object.keys(FORMATS).flatMap((format) =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  readdirSync(join(FIXTURES, format)).map((file) => ({ format, file })),
);

describe('same-format round trip', () => {
  it.each(fixtures)('$format/$file', ({ format, file }) => {
    const f = (FORMATS[format] as (typeof FORMATS)[string])(file);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const original = f.parse(readFileSync(join(FIXTURES, format, file), 'utf8'), file).schema;
    const { code } = f.serialize(original);
    const reparsed = f.reparse(code);

    expect(
      reparsed.diagnostics.filter((d) => d.severity === 'error'),
      code,
    ).toEqual([]);
    expect(canonical(reparsed.schema), code).toEqual(canonical(original));
  });
});
