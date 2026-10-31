import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import postgres from 'postgres';
import { inject } from 'vitest';
import type { Schema } from '../../src/ir/types';
import { INTROSPECTION_QUERIES, introspect, type Row } from '../../src/introspection';
import type { MigrationDialect, Statement } from '../../src/migrations/types';

/** A fresh, empty database on the shared container, for one case. */
export interface CaseDatabase {
  /** Run a script of one or more statements. */
  exec(sql: string): Promise<void>;
  /** Run generated statements the way the migration file lays them out. */
  migrate(statements: readonly Statement[]): Promise<void>;
  introspect(): Promise<Schema>;
  /** The introspection query's result as text, the way a SQL client shows it to the user. */
  introspectionText(): Promise<string>;
  close(): Promise<void>;
}

// Random, so reruns against reused containers never meet a database a killed run left behind.
const databaseName = (label: string) =>
  `rt_${randomBytes(4).toString('hex')}_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`.slice(
    0,
    60,
  );

function withDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

/** The query as a subquery: without its terminating semicolon. */
const asSubquery = (dialect: MigrationDialect) =>
  INTROSPECTION_QUERIES[dialect].trim().replace(/;$/, '');

async function textOf(run: (sql: string) => Promise<readonly Row[]>, sql: string) {
  const [row] = await run(sql);
  if (typeof row?.result !== 'string') throw new Error('The introspection query returned no text');
  return row.result;
}

async function schemaOf(run: (sql: string) => Promise<readonly Row[]>, dialect: MigrationDialect) {
  const result = await introspect(run, dialect);
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length)
    throw new Error(`Introspection failed:\n${errors.map((d) => d.message).join('\n')}`);
  return result.schema;
}

async function openPostgres(label: string): Promise<CaseDatabase> {
  const admin = postgres(inject('postgresUrl'), { max: 1, onnotice: () => undefined });
  const name = databaseName(label);
  await admin.unsafe(`CREATE DATABASE ${name}`);
  await admin.end();
  // One connection, so BEGIN … COMMIT wraps the statements between them.
  const sql = postgres(withDatabase(inject('postgresUrl'), name), {
    max: 1,
    onnotice: () => undefined,
  });
  const run = async (text: string) => (await sql.unsafe(text)) as unknown as readonly Row[];
  return {
    exec: async (text) => {
      if (text.trim()) await sql.unsafe(text);
    },
    migrate: async (statements) => {
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
    },
    introspect: () => schemaOf(run, 'postgres'),
    introspectionText: () =>
      textOf(run, `SELECT q.result::text AS result FROM (${asSubquery('postgres')}) q`),
    close: async () => {
      await sql.end();
      const drop = postgres(inject('postgresUrl'), { max: 1, onnotice: () => undefined });
      await drop.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await drop.end();
    },
  };
}

async function openMysql(label: string): Promise<CaseDatabase> {
  const name = databaseName(label);
  const connection = await mysql.createConnection({
    uri: inject('mysqlUrl'),
    multipleStatements: true,
  });
  await connection.query(`CREATE DATABASE ${name}`);
  await connection.query(`USE ${name}`);
  const run = async (text: string) => {
    const [rows] = await connection.query(text);
    return rows as Row[];
  };
  return {
    exec: async (text) => {
      if (text.trim()) await connection.query(text);
    },
    migrate: async (statements) => {
      for (const s of statements) await connection.query(s.sql);
    },
    introspect: () => schemaOf(run, 'mysql'),
    introspectionText: () =>
      textOf(run, `SELECT CAST(q.result AS CHAR) AS result FROM (${asSubquery('mysql')}) q`),
    close: async () => {
      await connection.query(`DROP DATABASE IF EXISTS ${name}`);
      await connection.end();
    },
  };
}

export const openDatabase = (dialect: MigrationDialect, label: string): Promise<CaseDatabase> =>
  dialect === 'postgres' ? openPostgres(label) : openMysql(label);
