import { dbDialectSchema, type DbDialect } from '@dashdb/shared';

export interface ConnectionTarget {
  dialect: DbDialect;
  host: string;
  port: number;
  database: string;
}

const DEFAULT_PORTS: Record<DbDialect, number> = {
  postgres: 5432,
  mysql: 3306,
};

const PROTOCOL_DIALECTS: Record<string, DbDialect> = {
  'postgres:': 'postgres',
  'postgresql:': 'postgres',
  'mysql:': 'mysql',
};

/**
 * Parse a connection URL such as `postgres://user:pass@host:5432/db` into its parts.
 * Credentials are deliberately dropped so the result is safe to log or display.
 */
export function parseConnectionUrl(url: string): ConnectionTarget {
  const parsed = new URL(url);
  const dialect = dbDialectSchema.parse(PROTOCOL_DIALECTS[parsed.protocol]);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!database) {
    throw new Error('Connection URL must include a database name');
  }
  return {
    dialect,
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : DEFAULT_PORTS[dialect],
    database,
  };
}

export * from './ir';
export * from './parsers';
export * from './serializers';
export * from './diff';
