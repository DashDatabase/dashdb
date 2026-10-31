// A worked example for every safety guide: a schema before and after a change that triggers the
// rule, run through @dashdb/core (diff, SQL, safety analysis) exactly as the editor runs it.
// Server-only and build-time: the guide pages ship the result as plain HTML.
import {
  analyzeMigration,
  diffSchemas,
  generateSQL,
  parseMySQLDDL,
  parsePostgresDDL,
  type Finding,
} from '@dashdb/core';
import type { GuideDialect } from './rule-guides';

export interface GuideExample {
  readonly before: string;
  readonly after: string;
  /** Rows assumed per table, so size-dependent rules apply as they would in production. */
  readonly rows: Readonly<Record<string, number>>;
  /**
   * The change is a rename. In the editor a column renamed on the canvas keeps its id, so the
   * diff always sees a rename; parsed from DDL it is matched by name, so accept any candidate.
   */
  readonly renames?: true;
}

const ROWS = 5_000_000;

const PG_USERS = `CREATE TABLE users (
  id         bigint PRIMARY KEY,
  email      text NOT NULL,
  name       text NOT NULL,
  phone      text,
  legacy_id  integer
);`;

const MY_USERS = `CREATE TABLE users (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  email      VARCHAR(255) NOT NULL,
  name       VARCHAR(120) NOT NULL,
  phone      VARCHAR(40),
  legacy_id  INT
);`;

const PG_ORDERS = `CREATE TABLE customers (
  id bigint PRIMARY KEY
);
CREATE TABLE orders (
  id          bigint PRIMARY KEY,
  customer_id bigint NOT NULL,
  total       integer NOT NULL
);`;

export const GUIDE_EXAMPLES: Readonly<Record<string, Partial<Record<GuideDialect, GuideExample>>>> =
  {
    'add-fk-validating': {
      postgres: {
        before: PG_ORDERS,
        after: PG_ORDERS.replace(
          'customer_id bigint NOT NULL,',
          'customer_id bigint NOT NULL REFERENCES customers (id),',
        ),
        rows: { orders: ROWS, customers: 800_000 },
      },
    },
    'add-not-null-without-default': {
      postgres: {
        before: PG_USERS,
        after: PG_USERS.replace(
          'legacy_id  integer',
          'legacy_id  integer,\n  plan       text NOT NULL',
        ),
        rows: { users: ROWS },
      },
    },
    'alter-type-rewrite': {
      postgres: {
        before: PG_ORDERS,
        after: PG_ORDERS.replace('total       integer', 'total       numeric(12, 2)'),
        rows: { orders: ROWS },
      },
    },
    'create-index-blocking': {
      postgres: {
        before: PG_USERS,
        after: `${PG_USERS}\nCREATE UNIQUE INDEX users_email_key ON users (email);`,
        rows: { users: ROWS },
      },
    },
    'drop-column': {
      postgres: {
        before: PG_USERS,
        after: PG_USERS.replace(',\n  legacy_id  integer', ''),
        rows: { users: ROWS },
      },
      mysql: {
        before: MY_USERS,
        after: MY_USERS.replace(',\n  legacy_id  INT', ''),
        rows: { users: ROWS },
      },
    },
    'drop-table': {
      postgres: {
        before: `${PG_USERS}\nCREATE TABLE sessions (\n  id      bigint PRIMARY KEY,\n  user_id bigint NOT NULL\n);`,
        after: PG_USERS,
        rows: { sessions: ROWS },
      },
    },
    'enum-value-removal': {
      postgres: {
        before: `CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'cancelled');
CREATE TABLE orders (
  id     bigint PRIMARY KEY,
  status order_status NOT NULL
);`,
        after: `CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped');
CREATE TABLE orders (
  id     bigint PRIMARY KEY,
  status order_status NOT NULL
);`,
        rows: { orders: ROWS },
      },
    },
    'rename-breaks-app': {
      postgres: {
        before: PG_USERS,
        after: PG_USERS.replace('name       text', 'full_name  text'),
        rows: { users: ROWS },
        renames: true,
      },
      mysql: {
        before: MY_USERS,
        after: MY_USERS.replace('name       VARCHAR', 'full_name  VARCHAR'),
        rows: { users: ROWS },
        renames: true,
      },
    },
    'set-not-null-scan': {
      postgres: {
        before: PG_USERS,
        after: PG_USERS.replace('phone      text', 'phone      text NOT NULL'),
        rows: { users: ROWS },
      },
    },
    'volatile-default-rewrite': {
      postgres: {
        before: PG_ORDERS,
        after: PG_ORDERS.replace(
          'total       integer NOT NULL',
          'total       integer NOT NULL,\n  public_id   uuid NOT NULL DEFAULT gen_random_uuid()',
        ),
        rows: { orders: ROWS },
      },
    },
    'alter-table-copy-algorithm': {
      mysql: {
        before: `CREATE TABLE orders (\n  id    BIGINT PRIMARY KEY AUTO_INCREMENT,\n  total INT NOT NULL\n);`,
        after: `CREATE TABLE orders (\n  id    BIGINT PRIMARY KEY AUTO_INCREMENT,\n  total DECIMAL(12, 2) NOT NULL\n);`,
        rows: { orders: 200_000 },
      },
    },
    'large-table-online-change': {
      mysql: {
        before: MY_USERS,
        after: MY_USERS.replace('phone      VARCHAR(40)', 'phone      VARCHAR(40) NOT NULL'),
        rows: { users: ROWS },
      },
    },
  };

export interface BuiltExample extends GuideExample {
  /** The up migration DashDB generates, without its file header. */
  readonly up: string;
  /** This rule's finding on that migration. */
  readonly finding: Finding;
  /** Every rule that fired, for context. */
  readonly ruleIds: readonly string[];
}

const PARSERS = { postgres: parsePostgresDDL, mysql: parseMySQLDDL } as const;
const cache = new Map<string, BuiltExample | null>();

/** Runs a guide's example through the engine. Null when the rule has no example for the dialect. */
export function buildGuideExample(ruleId: string, dialect: GuideDialect): BuiltExample | null {
  const key = `${dialect}/${ruleId}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const example = GUIDE_EXAMPLES[ruleId]?.[dialect];
  let built: BuiltExample | null = null;
  if (example) {
    // Readable, stable ids keep the output identical from build to build.
    const parse = (sql: string) => PARSERS[dialect](sql, { createId: (hint) => hint }).schema;
    const before = parse(example.before);
    const after = parse(example.after);
    const proposed = example.renames
      ? diffSchemas(before, after, { renameThreshold: 0 }).renameCandidates
      : [];
    const diff = diffSchemas(before, after, {
      confirmedRenames: proposed.map((c) => c.key),
      renameThreshold: 0,
    });
    const sql = generateSQL(diff, dialect, { now: new Date('2026-01-01T00:00:00Z') });
    const report = analyzeMigration(diff, dialect, { tableSizes: example.rows });
    const finding = report.findings.find((f) => f.ruleId === ruleId);
    if (!finding) throw new Error(`The ${key} guide example does not trigger its rule`);
    const up = sql.up
      .split('\n')
      .filter(
        (line) => !/^-- (Generated by|Operations:|Warnings:|Irreversible:|Direction:)/.test(line),
      )
      .join('\n')
      .trim();
    built = {
      ...example,
      up,
      finding,
      ruleIds: [...new Set(report.findings.map((f) => f.ruleId))],
    };
  }
  cache.set(key, built);
  return built;
}
