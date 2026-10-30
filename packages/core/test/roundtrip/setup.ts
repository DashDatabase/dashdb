import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

/*
 * Vitest global setup: one Postgres 17 and one MySQL 8.4 container for the whole run, started
 * in parallel. Test files create a fresh database per case inside them. With
 * TESTCONTAINERS_REUSE_ENABLE=true the containers survive between runs (fast local loops).
 */

declare module 'vitest' {
  export interface ProvidedContext {
    postgresUrl: string;
    mysqlUrl: string;
  }
}

const reuse = process.env.TESTCONTAINERS_REUSE_ENABLE === 'true';

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const pg = new PostgreSqlContainer('postgres:17');
  const my = new MySqlContainer('mysql:8.4').withRootPassword('roundtrip');
  if (reuse) {
    pg.withReuse();
    my.withReuse();
  }
  const [postgres, mysql]: [StartedPostgreSqlContainer, StartedMySqlContainer] = await Promise.all([
    pg.start(),
    my.start(),
  ]);
  project.provide('postgresUrl', postgres.getConnectionUri());
  project.provide('mysqlUrl', mysql.getConnectionUri(true));
  return async () => {
    if (reuse) return;
    await Promise.all([postgres.stop(), mysql.stop()]);
  };
}
