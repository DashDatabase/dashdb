import { readFileSync } from 'node:fs';
import { INTROSPECTION_QUERIES } from '@dashdb/core';
import { describe, expect, it } from 'vitest';
import { createSchema } from '@dashdb/core';
import { MAX_IMPORT_BYTES } from '../formats';
import { MAX_PROJECT_FILE_BYTES, serializeProjectFile } from '../project-file';
import { layoutFor } from '../store/layout';
import { CLIENT_GUIDES, QUERY_FILE_NAME } from './client-guides';
import {
  classifyUpload,
  importIntrospection,
  introspectionQuery,
  maxUploadBytes,
} from './import-sources';

const fixture = (name: string) =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed test fixtures
  readFileSync(
    new URL(
      `../../../../../packages/core/src/parsers/__fixtures__/introspection/${name}`,
      import.meta.url,
    ),
    'utf8',
  );

describe('classifyUpload', () => {
  it('detects schema source formats from the name and contents', () => {
    expect(classifyUpload('a.sql', 'CREATE TABLE `a` (id int) ENGINE=InnoDB;')).toEqual({
      kind: 'schema',
      format: 'mysql',
      text: 'CREATE TABLE `a` (id int) ENGINE=InnoDB;',
    });
    expect(classifyUpload('a.prisma', 'model A { id Int @id }')).toMatchObject({
      format: 'prisma',
    });
    expect(classifyUpload('a.dbml', 'Table a { id int }')).toMatchObject({ format: 'dbml' });
    expect(classifyUpload('notes.txt', 'Table a {\n id int\n}')).toMatchObject({ format: 'dbml' });
  });

  it('reads DashDB project files', () => {
    const schema = createSchema('postgres', { id: 's' });
    const text = serializeProjectFile({ name: 'Shop', schema, layout: layoutFor(schema) }, []);
    const result = classifyUpload('shop.dashdb.json', text);
    expect(result).toMatchObject({ kind: 'project', file: { project: { name: 'Shop' } } });
    expect(classifyUpload('shop.json', text).kind).toBe('project');
  });

  it('reports a JSON file that is not a valid project file', () => {
    const result = classifyUpload('x.dashdb.json', '{"format": "dashdb.project"}');
    expect(result.kind).toBe('error');
    expect(classifyUpload('x.json', 'nope')).toMatchObject({
      kind: 'error',
      errors: [expect.stringMatching(/^Not valid JSON/)],
    });
  });

  it('sizes uploads per kind', () => {
    expect(maxUploadBytes('a.sql')).toBe(MAX_IMPORT_BYTES);
    expect(maxUploadBytes('a.DASHDB.JSON')).toBe(MAX_PROJECT_FILE_BYTES);
  });
});

describe('importIntrospection', () => {
  it('shows exactly the core query for each dialect', () => {
    expect(introspectionQuery('postgres')).toBe(INTROSPECTION_QUERIES.postgres.trim());
    expect(introspectionQuery('mysql')).toBe(INTROSPECTION_QUERIES.mysql.trim());
  });

  it.each([
    ['postgres', 'pg-saas.json'],
    ['mysql', 'mysql-shop.json'],
  ] as const)('parses a %s result however the client wrapped it', (dialect, file) => {
    const json = JSON.stringify(JSON.parse(fixture(file)));
    const clean = importIntrospection(dialect, json);
    expect(clean.schema.tables.length).toBeGreaterThan(0);
    const wrapped = [
      ` result\n--------\n ${json}\n(1 row)\n`,
      `result\n${json}`,
      `"${json.replaceAll('"', '""')}"`,
      JSON.stringify(json),
    ];
    for (const text of wrapped) {
      const result = importIntrospection(dialect, text);
      expect(result.schema.tables.map((t) => t.name)).toEqual(
        clean.schema.tables.map((t) => t.name),
      );
    }
  });

  it('reports text that is not a query result', () => {
    const result = importIntrospection('postgres', 'ERROR: permission denied');
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', code: 'invalid-input' });
  });
});

describe('client guides', () => {
  it('cover psql, TablePlus, DBeaver and pgAdmin for Postgres, and a CLI for MySQL', () => {
    expect(CLIENT_GUIDES.postgres.map((g) => g.id)).toEqual([
      'psql',
      'tableplus',
      'dbeaver',
      'pgadmin',
    ]);
    expect(CLIENT_GUIDES.mysql.map((g) => g.id)).toContain('mysql');
    for (const guides of Object.values(CLIENT_GUIDES)) {
      for (const guide of guides) expect(guide.steps.length).toBeGreaterThan(1);
    }
    expect(CLIENT_GUIDES.postgres[0]?.command).toContain(QUERY_FILE_NAME.postgres);
    expect(CLIENT_GUIDES.mysql[0]?.command).toContain(QUERY_FILE_NAME.mysql);
  });
});
