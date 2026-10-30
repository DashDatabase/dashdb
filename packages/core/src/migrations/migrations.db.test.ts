// Runs generated migrations against real databases (pnpm test:db; DATABASE_URL / MYSQL_URL or the Testcontainers).
import mysql from 'mysql2/promise';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { diffSchemas } from '../diff/diff';
import { createSchema } from '../ir/edit';
import type { Schema } from '../ir/types';
import { toMySQLDDL, toPostgresDDL } from '../serializers';
import { loadFixtures } from '../serializers/__test-utils__/fixtures';
import { mysqlScenario, postgresScenario } from './__test-utils__/scenarios';
import { generateSQL } from './sql';
import type { Statement } from './types';

/*
 * For every scenario: build the before-schema, then apply up, down and up again, executing
 * statements the way the generated files lay them out (Postgres: before-phase statements,
 * BEGIN … COMMIT, after-phase statements). After each up the database must hold exactly the
 * after-schema's tables; after down, the before-schema's.
 */

const PG_URL = process.env.DATABASE_URL ?? inject('postgresUrl');
const MYSQL_URL = process.env.MYSQL_URL ?? inject('mysqlUrl');

const tableNames = (schema: Schema) => {
  const ns = new Map(schema.namespaces.map((n) => [n.id, n.name]));
  return schema.tables.map((t) => `${ns.get(t.namespace) ?? ''}.${t.name}`).sort();
};

const fixtures = loadFixtures();

/** Fixtures this environment cannot build, and why (plain postgres:17 / mysql:8.4 images). */
const UNSUPPORTED: Record<string, string> = {
  'postgres/ecommerce.sql':
    'a GIN index on varchar needs an operator class (gin_trgm_ops), which the IR does not model',
  'introspection/pg-saas.json': 'uses the vector type from pgvector, not in the postgres image',
};

/** Non-default namespaces the fixtures of a dialect use; reset before every case. */
const namespacesOf = (dialect: 'postgres' | 'mysql', defaultNamespace: string) => [
  ...new Set(
    fixtures
      .filter((f) => f.schema.dialect === dialect)
      .flatMap((f) => f.schema.namespaces.map((n) => n.name))
      .filter((n) => n !== defaultNamespace),
  ),
];

const cases = (dialect: 'postgres' | 'mysql', scenario: typeof postgresScenario) => [
  { name: scenario.name, before: scenario.before, after: scenario.after, diff: scenario.diff },
  ...fixtures
    .filter((f) => f.schema.dialect === dialect && !(`${f.format}/${f.file}` in UNSUPPORTED))
    .map((f) => {
      const empty = createSchema(dialect);
      return {
        name: `${f.format}/${f.file}`,
        before: empty,
        after: f.schema,
        diff: diffSchemas(empty, f.schema),
      };
    }),
];

describe('postgres', () => {
  // A database of its own, so `public` is the real public schema (SQL from pg_dump names it).
  const DATABASE = 'dashdb_migration_test';
  const admin = postgres(PG_URL, { max: 1, onnotice: () => undefined });
  const url = new URL(PG_URL);
  url.pathname = `/${DATABASE}`;
  const sql = postgres(url.toString(), { max: 1, onnotice: () => undefined });
  const extraSchemas = namespacesOf('postgres', 'public');

  const reset = async () => {
    for (const s of ['public', ...extraSchemas])
      await sql.unsafe(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
    await sql.unsafe('CREATE SCHEMA public');
    // Extensions live in their own schema, so resetting public keeps them.
    await sql.unsafe('SET search_path TO public, extensions');
  };

  const run = async (statements: readonly Statement[]) => {
    const phase = (p: Statement['phase']) => statements.filter((s) => s.phase === p);
    for (const s of phase('before')) await sql.unsafe(s.sql);
    await sql.unsafe('BEGIN');
    try {
      for (const s of phase('main')) await sql.unsafe(s.sql);
      await sql.unsafe('COMMIT');
    } catch (error) {
      await sql.unsafe('ROLLBACK');
      throw error;
    }
    for (const s of phase('after')) await sql.unsafe(s.sql);
  };

  const tables = async () => {
    const rows = await sql.unsafe<{ name: string }[]>(
      `SELECT table_schema || '.' || table_name AS name
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE' AND table_schema IN ('${['public', ...extraSchemas].join("', '")}')`,
    );
    return rows.map((r) => r.name).sort();
  };

  beforeAll(async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${DATABASE}`);
    await sql.unsafe('CREATE SCHEMA extensions');
    await sql.unsafe('CREATE EXTENSION IF NOT EXISTS citext SCHEMA extensions');
    await sql.unsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions');
  });
  afterAll(async () => {
    await sql.end();
    await admin.unsafe(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it.each(cases('postgres', postgresScenario))(
    '$name: up, down, up',
    async ({ before, after, diff }) => {
      await reset();
      const setup = toPostgresDDL(before).code;
      if (setup) await sql.unsafe(setup);
      const migration = generateSQL(diff, 'postgres');
      await run(migration.statements);
      expect(await tables()).toEqual(tableNames(after));
      await run(migration.downStatements);
      expect(await tables()).toEqual(tableNames(before));
      await run(migration.statements);
      expect(await tables()).toEqual(tableNames(after));
    },
  );
});

describe('mysql', () => {
  let connection: mysql.Connection;
  const DATABASE = 'dashdb_migration_test';
  const extraDatabases = namespacesOf('mysql', 'default');

  const reset = async () => {
    for (const d of [DATABASE, ...extraDatabases])
      await connection.query(`DROP DATABASE IF EXISTS ${d}`);
    await connection.query(`CREATE DATABASE ${DATABASE}`);
    await connection.query(`USE ${DATABASE}`);
  };

  const run = async (statements: readonly Statement[]) => {
    for (const s of statements) await connection.query(s.sql);
  };

  const tables = async () => {
    const [rows] = await connection.query(
      `SELECT CONCAT(IF(table_schema = '${DATABASE}', 'default', table_schema), '.', table_name) AS name
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE' AND table_schema IN ('${[DATABASE, ...extraDatabases].join("', '")}')`,
    );
    return (rows as { name: string }[]).map((r) => r.name).sort();
  };

  beforeAll(async () => {
    connection = await mysql.createConnection({ uri: MYSQL_URL, multipleStatements: true });
    // WordPress-style schemas use zero-date defaults, as older MySQL installs allow.
    await connection.query(
      "SET SESSION sql_mode = REPLACE(REPLACE(@@sql_mode, 'NO_ZERO_IN_DATE', ''), 'NO_ZERO_DATE', '')",
    );
  });
  afterAll(async () => {
    for (const d of [DATABASE, ...extraDatabases])
      await connection.query(`DROP DATABASE IF EXISTS ${d}`);
    await connection.end();
  });

  it.each(cases('mysql', mysqlScenario))('$name: up, down, up', async ({ before, after, diff }) => {
    await reset();
    const setup = toMySQLDDL(before).code;
    if (setup) await connection.query(setup);
    const migration = generateSQL(diff, 'mysql');
    await run(migration.statements);
    expect(await tables()).toEqual(tableNames(after));
    await run(migration.downStatements);
    expect(await tables()).toEqual(tableNames(before));
    await run(migration.statements);
    expect(await tables()).toEqual(tableNames(after));
  });
});
