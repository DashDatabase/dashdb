import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Schema } from '../../ir/types';
import {
  parseDBML,
  parseIntrospectionJSON,
  parseMySQLDDL,
  parsePostgresDDL,
  parsePrisma,
} from '../../parsers';

export const FIXTURES = join(import.meta.dirname, '..', '..', 'parsers', '__fixtures__');

export interface Fixture {
  readonly format: string;
  readonly file: string;
  readonly schema: Schema;
}

const PARSE: Record<string, (source: string, file: string) => Schema> = {
  postgres: (s) => parsePostgresDDL(s).schema,
  mysql: (s) => parseMySQLDDL(s).schema,
  prisma: (s) => parsePrisma(s).schema,
  dbml: (s) => parseDBML(s).schema,
  introspection: (s, file) =>
    parseIntrospectionJSON(s, file.startsWith('mysql-') ? 'mysql' : 'postgres').schema,
};

/** Every P05 fixture, parsed. Paths are fixed to this repository's fixture folder. */
export function loadFixtures(): Fixture[] {
  return Object.keys(PARSE).flatMap((format) => {
    const parse = PARSE[format] as (typeof PARSE)[string];
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return readdirSync(join(FIXTURES, format)).map((file) => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const source = readFileSync(join(FIXTURES, format, file), 'utf8');
      return { format, file, schema: parse(source, file) };
    });
  });
}

/** The same schema with every top-level collection in reverse order. */
export function reversed(schema: Schema): Schema {
  return {
    ...schema,
    namespaces: [...schema.namespaces].reverse(),
    enums: [...schema.enums].reverse(),
    tables: [...schema.tables].reverse(),
  };
}
