// The converter tools at /tools/<slug>: what each converts, and the explanation, type mapping,
// gotchas and FAQ on its page. Conversions themselves run in the browser through
// `@dashdb/core/convert`; registry.test.ts checks every mapping row against that converter.
import { CONVERT_EXAMPLES } from '@dashdb/core/examples';
import type { ConvertFrom, ConvertTo } from '@dashdb/core/lite';
import type { FaqItem } from '@/lib/json-ld';

export type ToolCategory = 'orm' | 'dialects' | 'dbml' | 'diagrams';

export const CATEGORIES: Record<ToolCategory, { title: string; description: string }> = {
  orm: {
    title: 'SQL and ORMs',
    description: 'Move a schema between raw SQL, Prisma and Drizzle.',
  },
  dialects: {
    title: 'Between databases',
    description: 'Translate DDL from PostgreSQL to MySQL and back.',
  },
  dbml: {
    title: 'DBML',
    description: 'Go between dbdiagram.io-style DBML and SQL.',
  },
  diagrams: {
    title: 'Diagrams',
    description: 'Turn a schema into an ER diagram for docs and READMEs.',
  },
};

export interface MappingRow {
  /** What you write in the source format. */
  readonly source: string;
  /** What the converter writes, as shown in the table. */
  readonly target: string;
  readonly note?: string;
  /** Text the output must contain (defaults to `target`); checked by registry.test.ts. */
  readonly expect?: string;
  /** Full input for the check; by default a one-column table using `source` as the type. */
  readonly sample?: string;
}

export interface Gotcha {
  readonly title: string;
  readonly body: string;
}

export interface ToolDefinition {
  readonly slug: string;
  readonly from: ConvertFrom;
  readonly to: ConvertTo;
  readonly category: ToolCategory;
  /** The page's <title> (before " · DashDB"). */
  readonly title: string;
  readonly h1: string;
  /** Meta description, also the hub card text. */
  readonly description: string;
  /** One sentence under the H1. */
  readonly lead: string;
  readonly exampleInput: string;
  /** Explanation paragraphs. With the gotchas, 300-500 words (registry.test.ts). */
  readonly intro: readonly string[];
  readonly mapping: {
    readonly heading: string;
    readonly columns: readonly [string, string];
    readonly rows: readonly MappingRow[];
  };
  readonly gotchas: readonly Gotcha[];
  readonly faq: readonly FaqItem[];
  readonly related: readonly string[];
  readonly guides: readonly { readonly href: string; readonly label: string }[];
  /** Also render the result as a diagram (prisma-to-erd). */
  readonly diagram?: boolean;
}

/** Display and editor details for each format a tool reads or writes. */
export const FORMATS: Record<
  ConvertFrom | ConvertTo,
  { label: string; language: string; extension: string }
> = {
  sql: { label: 'SQL', language: 'pgsql', extension: 'sql' },
  postgres: { label: 'PostgreSQL', language: 'pgsql', extension: 'sql' },
  mysql: { label: 'MySQL', language: 'mysql', extension: 'sql' },
  prisma: { label: 'Prisma', language: 'prisma', extension: 'prisma' },
  dbml: { label: 'DBML', language: 'dbml', extension: 'dbml' },
  drizzle: { label: 'Drizzle', language: 'typescript', extension: 'ts' },
  mermaid: { label: 'Mermaid', language: 'plaintext', extension: 'mmd' },
};

const ENUM_PG =
  "CREATE TYPE plan AS ENUM ('free', 'pro');\nCREATE TABLE t (id int PRIMARY KEY, col plan NOT NULL);";

export const TOOLS = [
  {
    slug: 'sql-to-prisma',
    from: 'sql',
    to: 'prisma',
    category: 'orm',
    title: 'SQL to Prisma schema converter',
    h1: 'Convert SQL to a Prisma schema',
    description:
      'Paste PostgreSQL or MySQL CREATE TABLE statements and get a schema.prisma with models, relations, enums and @map names. Free, runs in your browser.',
    lead: 'Paste CREATE TABLE statements; get models, relations and enums ready for schema.prisma.',
    exampleInput: CONVERT_EXAMPLES.saasPostgres.source,
    intro: [
      'Adopting Prisma on an existing database usually starts with `prisma db pull`, which needs a live connection. When all you have is a migration file, a dump, or DDL from a design doc, this converter does the same job from the SQL text: it parses the statements in your browser and writes a Prisma schema you can drop into your project.',
      'Tables become models with singular PascalCase names, and snake_case columns become camelCase fields. The original names are kept with `@@map` and `@map`, so Prisma still talks to the tables you already have. Every foreign key turns into a pair of relation fields, one on each side, with its `onDelete` rule, and composite primary keys become `@@id`. The dialect is detected from the SQL, so a MySQL dump produces a `mysql` datasource with `@db.UnsignedInt` and friends where they matter.',
      'Native types are kept precise with `@db` attributes: a `varchar(64)` stays `@db.VarChar(64)` instead of widening to plain `String`, and `timestamptz` keeps its time zone with `@db.Timestamptz`.',
      'To use the result, save it as `prisma/schema.prisma`, set `DATABASE_URL` and run `npx prisma generate`. If the database already exists, do not let Prisma recreate it: write a baseline with `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`, save it as `prisma/migrations/0_init/migration.sql`, and mark it applied with `npx prisma migrate resolve --applied 0_init`. From then on, `prisma migrate dev` only produces the changes you make. Rename models and fields freely; `@@map` and `@map` keep them pointed at the right tables.',
    ],
    mapping: {
      heading: 'PostgreSQL to Prisma type mapping',
      columns: ['PostgreSQL', 'Prisma'],
      rows: [
        { source: 'serial', target: 'Int @default(autoincrement())' },
        { source: 'bigserial', target: 'BigInt @default(autoincrement())' },
        { source: 'integer', target: 'Int' },
        { source: 'smallint', target: 'Int @db.SmallInt' },
        { source: 'numeric(10,2)', target: 'Decimal @db.Decimal(10, 2)' },
        { source: 'boolean', target: 'Boolean' },
        { source: 'text', target: 'String' },
        { source: 'varchar(120)', target: 'String @db.VarChar(120)' },
        { source: 'uuid', target: 'String @db.Uuid' },
        { source: 'jsonb', target: 'Json' },
        { source: 'timestamptz', target: 'DateTime @db.Timestamptz' },
        { source: 'date', target: 'DateTime @db.Date' },
        { source: 'bytea', target: 'Bytes' },
        { source: 'text[]', target: 'String[]' },
      ],
    },
    gotchas: [
      {
        title: 'CHECK constraints and partial indexes are dropped',
        body: 'Prisma schemas cannot express them. The converter lists each one it leaves out; keep them in a raw SQL migration so the database still enforces them.',
      },
      {
        title: 'Join tables stay explicit models',
        body: 'A table like `memberships` with two foreign keys becomes its own model rather than an implicit many-to-many, because implicit relations need Prisma’s `_AToB` naming and cannot carry extra columns such as `role`.',
      },
      {
        title: 'Database functions become dbgenerated()',
        body: 'Defaults Prisma has no keyword for, such as `gen_random_uuid()`, are written as `@default(dbgenerated("…"))` so the database keeps generating them.',
      },
    ],
    faq: [
      {
        question: 'Is this the same as prisma db pull?',
        answer:
          'It produces the same kind of schema, but from SQL text instead of a live database, so you can convert a migration file or a dump without connecting to anything.',
      },
      {
        question: 'Does it work with MySQL dumps?',
        answer:
          'Yes. The dialect is detected from the SQL (backticks, AUTO_INCREMENT, ENGINE=…), and the schema gets a mysql datasource with matching @db attributes.',
      },
      {
        question: 'Is my SQL uploaded anywhere?',
        answer:
          'No. Parsing and conversion run entirely in your browser; nothing is sent to a server.',
      },
    ],
    related: ['prisma-to-sql', 'sql-to-drizzle', 'prisma-to-drizzle'],
    guides: [
      { href: '/features/migrations', label: 'Generating Prisma migrations from a diagram' },
      { href: '/guides/postgres/rename-breaks-app', label: 'Why renames break running app code' },
    ],
  },
  {
    slug: 'prisma-to-sql',
    from: 'prisma',
    to: 'sql',
    category: 'orm',
    title: 'Prisma schema to SQL converter',
    h1: 'Convert a Prisma schema to SQL',
    description:
      'Turn schema.prisma into PostgreSQL or MySQL CREATE TABLE statements, with enums, indexes and foreign keys. See the DDL Prisma Migrate would run. Free, in-browser.',
    lead: 'See the exact tables, enums, indexes and foreign keys your schema.prisma describes.',
    exampleInput: CONVERT_EXAMPLES.blogPrisma.source,
    intro: [
      'A Prisma schema hides the DDL behind it. That is convenient until you need to review a change with a DBA, run the schema on a database Prisma does not manage, or simply check what a `String` really becomes. This converter reads your schema.prisma and writes the CREATE statements it describes, in the dialect your datasource names: `postgresql` gives PostgreSQL DDL, `mysql` gives MySQL.',
      'Names follow Prisma’s rules. `@@map` and `@map` decide table and column names, and constraint names match what Prisma Migrate generates (`users_pkey`, `users_email_key`, `posts_author_id_fkey`), so the output lines up with a database Prisma created. Enums become `CREATE TYPE` in PostgreSQL, quoted when their names are mixed case, and inline `enum(…)` columns in MySQL. Relations become foreign keys with Prisma’s default `ON UPDATE CASCADE`.',
      'Types use Prisma’s defaults unless a `@db` attribute says otherwise: `DateTime` is `timestamp(3)`, `Decimal` is `decimal(65,30)`, and `String` is `text` in PostgreSQL.',
      'Use the output to review a schema before its first deploy, to give a DBA something they can read, or to create the tables on a database Prisma does not manage. When Prisma Migrate owns the database, `npx prisma migrate diff --from-empty --to-schema-datamodel schema.prisma --script` writes the same kind of DDL; this converter is for when you want it without installing anything, or from a schema file someone sent you. The DashDB editor can also open the schema as a diagram and generate the migration for a change.',
    ],
    mapping: {
      heading: 'Prisma to PostgreSQL type mapping',
      columns: ['Prisma', 'PostgreSQL'],
      rows: [
        { source: 'String', target: 'text' },
        { source: 'String @db.VarChar(200)', target: 'varchar(200)' },
        { source: 'Int', target: 'integer' },
        { source: 'BigInt', target: 'bigint' },
        { source: 'Float', target: 'double precision' },
        { source: 'Decimal', target: 'decimal(65,30)' },
        { source: 'Boolean', target: 'boolean' },
        { source: 'DateTime', target: 'timestamp(3)' },
        { source: 'DateTime @db.Date', target: 'date' },
        { source: 'Json', target: 'jsonb' },
        { source: 'Bytes', target: 'bytea' },
        { source: 'String @db.Uuid', target: 'uuid' },
        { source: 'String[]', target: 'text[]' },
      ],
    },
    gotchas: [
      {
        title: 'uuid() and cuid() have no database default',
        body: '`@default(uuid())` is generated by Prisma Client, not the database. The SQL column has no default, and the converter warns about it; inserts from other clients must supply an id.',
      },
      {
        title: '@updatedAt is client-side too',
        body: 'Prisma Client sets it on every update. The database will not, so add a trigger if other writers touch the table.',
      },
      {
        title: 'Implicit many-to-many relations add a table',
        body: 'Two list fields pointing at each other produce a `_PostToTag` join table with columns `A` and `B`, exactly as Prisma Migrate creates it.',
      },
    ],
    faq: [
      {
        question: 'Can I get MySQL instead of PostgreSQL?',
        answer:
          'Yes. Set provider = "mysql" in the datasource block and the output switches to MySQL DDL with backtick-free names, AUTO_INCREMENT and inline enums.',
      },
      {
        question: 'Is the output a Prisma migration?',
        answer:
          'It is the full schema as CREATE statements, not a diff. To generate a migration between two versions of a schema, use the DashDB editor’s migration panel.',
      },
      {
        question: 'Why is there no default on my id column?',
        answer:
          'uuid() and cuid() defaults are generated by Prisma Client in your application, so the database column itself has none.',
      },
    ],
    related: ['sql-to-prisma', 'prisma-to-drizzle', 'prisma-to-erd'],
    guides: [
      { href: '/features/migrations', label: 'Safe migrations from schema changes' },
      {
        href: '/guides/postgres/add-not-null-without-default',
        label: 'Adding a NOT NULL column safely',
      },
    ],
  },
  {
    slug: 'postgres-to-mysql',
    from: 'postgres',
    to: 'mysql',
    category: 'dialects',
    title: 'PostgreSQL to MySQL schema converter',
    h1: 'Convert PostgreSQL DDL to MySQL',
    description:
      'Translate PostgreSQL CREATE TABLE statements to MySQL 8: serial to AUTO_INCREMENT, uuid to char(36), jsonb to json, enums inline. Warnings for what does not translate.',
    lead: 'Paste PostgreSQL DDL and get MySQL 8 tables, with a warning for anything that does not carry over.',
    exampleInput: CONVERT_EXAMPLES.appPostgres.source,
    intro: [
      'PostgreSQL and MySQL agree on most of SQL’s shape but disagree on many names. This converter maps each column through a database-neutral type, so `serial` becomes `int AUTO_INCREMENT`, `boolean` becomes `tinyint(1)`, `jsonb` becomes `json`, and a `CREATE TYPE … AS ENUM` turns into an inline `enum(…)` on every column that uses it.',
      'Time zones need a decision. PostgreSQL `timestamptz` maps to MySQL `timestamp`, which also stores UTC and converts to the session time zone, while `timestamp` without a zone maps to `datetime`. Foreign keys are added after all tables exist, so table order never matters, and PostgreSQL schemas become MySQL databases.',
      'The output has been run against MySQL 8.4: indexed `text` columns are written as `varchar(255)`, because MySQL cannot index `TEXT` without a prefix length, and literal defaults on `text` or `json` columns are wrapped in parentheses, the expression form MySQL 8.0.13 and later require.',
      'Before running the result, read the warnings under the output: each one names a column and what is left to decide about it. Create an empty database (MySQL 8 already defaults to `utf8mb4`, which matches PostgreSQL’s UTF8) and run the script; foreign keys come last, so it applies in one pass. Load data once the tables exist, with booleans as 0 and 1 and UUIDs as 36-character strings. If an ORM generates your schema, regenerate its migrations for MySQL rather than keeping two hand-maintained copies.',
    ],
    mapping: {
      heading: 'PostgreSQL to MySQL type mapping',
      columns: ['PostgreSQL', 'MySQL'],
      rows: [
        { source: 'serial', target: 'int AUTO_INCREMENT', expect: 'int NOT NULL AUTO_INCREMENT' },
        {
          source: 'bigint GENERATED BY DEFAULT AS IDENTITY',
          target: 'bigint AUTO_INCREMENT',
          expect: 'bigint NOT NULL AUTO_INCREMENT',
        },
        { source: 'boolean', target: 'tinyint(1)' },
        { source: 'uuid', target: 'char(36)' },
        { source: 'jsonb', target: 'json' },
        { source: 'timestamptz', target: 'timestamp' },
        { source: 'timestamp', target: 'datetime' },
        { source: 'bytea', target: 'blob' },
        { source: 'numeric(12,2)', target: 'decimal(12,2)' },
        { source: 'real', target: 'float' },
        { source: 'double precision', target: 'double' },
        { source: 'enum type plan', target: "enum('free','pro')", sample: ENUM_PG },
      ],
    },
    gotchas: [
      {
        title: 'Arrays and network types have no MySQL equivalent',
        body: '`text[]`, `inet` and similar types are kept as written and flagged. Store arrays as `json` or in a child table.',
      },
      {
        title: 'Partial indexes lose their WHERE clause',
        body: 'MySQL has no partial indexes, so a unique index with `WHERE` becomes a full unique index. Check it still allows your existing rows.',
      },
      {
        title: 'Function defaults are copied, not translated',
        body: 'A default like `gen_random_uuid()` is written as is and flagged; in MySQL use `(UUID())`.',
      },
    ],
    faq: [
      {
        question: 'Which MySQL version does the output target?',
        answer:
          'MySQL 8.0.13 or later, which accepts expression defaults and enforces CHECK constraints. The example output is tested against MySQL 8.4.',
      },
      {
        question: 'Does it migrate my data?',
        answer:
          'No, it converts the schema (DDL) only. Load data separately with your usual export and import tools once the tables exist.',
      },
      {
        question: 'What happens to PostgreSQL schemas like billing.invoices?',
        answer:
          'Each non-public schema becomes a MySQL database (CREATE DATABASE IF NOT EXISTS), and tables are qualified with it.',
      },
    ],
    related: ['mysql-to-postgres', 'sql-to-prisma', 'sql-to-dbml'],
    guides: [
      {
        href: '/guides/mysql/alter-table-copy-algorithm',
        label: 'Changes MySQL makes with ALGORITHM=COPY',
      },
      {
        href: '/guides/postgres/alter-type-rewrite',
        label: 'Type changes that rewrite a PostgreSQL table',
      },
    ],
  },
  {
    slug: 'mysql-to-postgres',
    from: 'mysql',
    to: 'postgres',
    category: 'dialects',
    title: 'MySQL to PostgreSQL schema converter',
    h1: 'Convert MySQL DDL to PostgreSQL',
    description:
      'Paste a MySQL dump or CREATE TABLE statements and get PostgreSQL DDL: AUTO_INCREMENT to identity, tinyint(1) to boolean, enums to CREATE TYPE. Tested on PostgreSQL 17.',
    lead: 'Paste mysqldump output or CREATE TABLE statements; get PostgreSQL tables that run as is.',
    exampleInput: CONVERT_EXAMPLES.shopMysql.source,
    intro: [
      'Moving from MySQL to PostgreSQL starts with the schema, and `mysqldump` output does not run on PostgreSQL: backticks, `ENGINE=InnoDB`, `AUTO_INCREMENT` and `tinyint(1)` all need translating. This converter reads that DDL, table options included, and writes PostgreSQL that has been run against PostgreSQL 17.',
      'Auto-increment columns become `GENERATED BY DEFAULT AS IDENTITY`, the modern replacement for `serial`. `tinyint(1)` becomes `boolean`, with its `0` and `1` defaults turned into `FALSE` and `TRUE`, since PostgreSQL rejects a number as a boolean default. Each inline `enum(…)` becomes a named type, `CREATE TYPE customers_tier AS ENUM (…)`, built from the table and column names.',
      'Unsigned integers have no PostgreSQL counterpart, so they widen: `int unsigned` becomes `bigint` to keep its full range, and `bigint unsigned` becomes `numeric(20,0)`. An unsigned `bigint` auto-increment column is written as `bigint`, because identity columns must be integers; that caps it at 9,223,372,036,854,775,807, and the converter says so.',
      'A practical order for the move: create the tables from this output, load the data with a tool such as pgloader or `COPY`, then reset each identity column and add triggers for any `ON UPDATE` columns you rely on. Run `ANALYZE` afterwards so the planner has statistics from the first query. PostgreSQL folds unquoted names to lowercase, and the converter only quotes names that need it, so queries that relied on MySQL’s case-insensitive table names may need adjusting.',
    ],
    mapping: {
      heading: 'MySQL to PostgreSQL type mapping',
      columns: ['MySQL', 'PostgreSQL'],
      rows: [
        {
          source: 'int AUTO_INCREMENT',
          target: 'integer GENERATED BY DEFAULT AS IDENTITY',
          sample: 'CREATE TABLE t (col int NOT NULL AUTO_INCREMENT PRIMARY KEY);',
        },
        { source: 'int unsigned', target: 'bigint' },
        { source: 'bigint unsigned', target: 'numeric(20,0)' },
        { source: 'tinyint(1)', target: 'boolean' },
        { source: 'mediumint', target: 'integer' },
        { source: 'decimal(10,2)', target: 'numeric(10,2)' },
        { source: 'float', target: 'real' },
        { source: 'double', target: 'double precision' },
        { source: 'longtext', target: 'text' },
        { source: 'json', target: 'jsonb' },
        { source: 'datetime', target: 'timestamp' },
        { source: 'timestamp', target: 'timestamptz' },
        { source: 'blob', target: 'bytea' },
        { source: 'year', target: 'smallint' },
        {
          source: "enum('a','b')",
          target: "CREATE TYPE t_col AS ENUM ('a', 'b')",
          sample: "CREATE TABLE t (id int PRIMARY KEY, col enum('a','b') NOT NULL);",
        },
      ],
    },
    gotchas: [
      {
        title: 'SET columns are kept as written',
        body: 'MySQL `SET(…)` has no PostgreSQL type, so the converter keeps it and warns. Store the values in a `text[]` column instead, and check them with a constraint if you need to.',
      },
      {
        title: 'ON UPDATE CURRENT_TIMESTAMP is dropped',
        body: 'PostgreSQL columns cannot update themselves. The converter warns; add a trigger or set the value in your application.',
      },
      {
        title: 'Reset identity sequences after loading data',
        body: 'Identity columns start at 1. After importing rows, run `SELECT setval(…)` or `ALTER TABLE … ALTER COLUMN id RESTART WITH …` so new rows do not collide.',
      },
      {
        title: 'Zero dates will not load',
        body: 'PostgreSQL rejects `0000-00-00`. Clean those values (usually to NULL) before importing data.',
      },
    ],
    faq: [
      {
        question: 'Can I paste a whole mysqldump file?',
        answer:
          'Yes. CREATE TABLE statements are converted and the rest (SET statements, LOCK TABLES, INSERTs) is skipped, so paste the schema-only dump (--no-data) for the cleanest result.',
      },
      {
        question: 'Why does int unsigned become bigint?',
        answer:
          'PostgreSQL has no unsigned integers. bigint is the smallest type that holds every int unsigned value (up to 4,294,967,295).',
      },
      {
        question: 'What happens to ENGINE and CHARSET options?',
        answer:
          'They are dropped. PostgreSQL has one storage engine, and the database encoding (normally UTF8) applies to every table.',
      },
    ],
    related: ['postgres-to-mysql', 'sql-to-prisma', 'sql-to-drizzle'],
    guides: [
      {
        href: '/guides/postgres/set-not-null-scan',
        label: 'SET NOT NULL and table scans in PostgreSQL',
      },
      {
        href: '/guides/postgres/create-index-blocking',
        label: 'Building indexes without blocking writes',
      },
    ],
  },
  {
    slug: 'sql-to-drizzle',
    from: 'sql',
    to: 'drizzle',
    category: 'orm',
    title: 'SQL to Drizzle ORM schema converter',
    h1: 'Convert SQL to a Drizzle schema',
    description:
      'Generate a Drizzle ORM schema.ts from PostgreSQL or MySQL CREATE TABLE statements: tables, foreign keys, checks and relations(). Formatted and ready to commit.',
    lead: 'Paste CREATE TABLE statements; get a formatted schema.ts with tables, constraints and relations().',
    exampleInput: CONVERT_EXAMPLES.inventoryPostgres.source,
    intro: [
      'Drizzle schemas are TypeScript, which makes them pleasant to read and tedious to write by hand for an existing database. This converter writes the `schema.ts` for you from DDL: one `pgTable` (or `mysqlTable` for MySQL input) per table, with builders that match each column’s exact type, `.notNull()`, defaults, and a constraint callback for composite keys, unique constraints, checks and foreign keys.',
      'It also writes `relations()` for every table, so the relational query API works straight away: `one()` on the side holding the foreign key and `many()` on the other, named from the columns (`category`, `stockLevels`). Self-references get a `relationName` so Drizzle can tell both ends apart. Imports are trimmed to what is used, and the file is formatted with Prettier.',
      "Column keys are camelCase while the database names stay snake_case, the usual Drizzle convention: `price_cents` becomes `priceCents: integer('price_cents')`.",
      'Save the output as your schema file (for example `src/db/schema.ts`) and point `drizzle.config.ts` at it. If the tables already exist, start your migration history from this schema, or use `drizzle-kit push`, so the first migration does not try to create them again. The relational query API works straight away, because the relations are already declared: `db.query.products.findMany({ with: { category: true } })` returns each product with its category.',
    ],
    mapping: {
      heading: 'PostgreSQL to Drizzle column builders',
      columns: ['PostgreSQL', 'Drizzle (pg-core)'],
      rows: [
        { source: 'serial', target: 'serial()', expect: "serial('col')" },
        {
          source: 'bigserial',
          target: "bigserial({ mode: 'number' })",
          expect: "bigserial('col', { mode: 'number' })",
        },
        { source: 'integer', target: 'integer()', expect: "integer('col')" },
        {
          source: 'bigint',
          target: "bigint({ mode: 'number' })",
          expect: "bigint('col', { mode: 'number' })",
        },
        {
          source: 'numeric(10,2)',
          target: 'numeric({ precision: 10, scale: 2 })',
          expect: "numeric('col', { precision: 10, scale: 2 })",
        },
        { source: 'boolean', target: 'boolean()', expect: "boolean('col')" },
        {
          source: 'varchar(32)',
          target: 'varchar({ length: 32 })',
          expect: "varchar('col', { length: 32 })",
        },
        { source: 'char(4)', target: 'char({ length: 4 })', expect: "char('col', { length: 4 })" },
        { source: 'uuid', target: 'uuid()', expect: "uuid('col')" },
        { source: 'jsonb', target: 'jsonb()', expect: "jsonb('col')" },
        {
          source: 'timestamptz',
          target: 'timestamp({ withTimezone: true })',
          expect: "timestamp('col', { withTimezone: true })",
        },
        { source: 'text[]', target: 'text().array()', expect: "text('col').array()" },
        { source: 'bytea', target: 'customType (bytea)', expect: "byteaType('col')" },
      ],
    },
    gotchas: [
      {
        title: 'Enums become pgEnum declarations',
        body: 'Each `CREATE TYPE … AS ENUM` becomes an exported `pgEnum`, declared before the tables that use it, so you can import it for your own TypeScript types as well.',
      },
      {
        title: 'bigint columns use number mode',
        body: "JavaScript numbers are exact up to 2^53. If your ids can exceed that, change `mode: 'number'` to `mode: 'bigint'`.",
      },
      {
        title: 'numeric values come back as strings',
        body: 'Drizzle returns `numeric` as a string to avoid rounding; convert it explicitly where you do arithmetic.',
      },
      {
        title: 'Types without a builder use customType',
        body: '`bytea` and similar types get a small `customType` declaration at the top of the file instead of being dropped.',
      },
    ],
    faq: [
      {
        question: 'Does it support MySQL?',
        answer:
          'Yes. MySQL DDL is detected automatically and produces mysqlTable definitions from drizzle-orm/mysql-core, including unsigned integers and onUpdateNow().',
      },
      {
        question: 'Can I use the output with drizzle-kit?',
        answer:
          'Yes. Save it as your schema file and drizzle-kit can generate or push migrations from it as usual.',
      },
      {
        question: 'Is anything sent to a server?',
        answer:
          'No. The SQL is parsed and the TypeScript is generated and formatted in your browser.',
      },
    ],
    related: ['prisma-to-drizzle', 'sql-to-prisma', 'mysql-to-postgres'],
    guides: [
      { href: '/features/migrations', label: 'Drizzle migrations from a diagram' },
      {
        href: '/guides/postgres/add-fk-validating',
        label: 'Adding a foreign key without long locks',
      },
    ],
  },
  {
    slug: 'prisma-to-drizzle',
    from: 'prisma',
    to: 'drizzle',
    category: 'orm',
    title: 'Prisma to Drizzle schema converter',
    h1: 'Convert a Prisma schema to Drizzle',
    description:
      'Migrate from Prisma to Drizzle ORM: paste schema.prisma, get a Drizzle schema.ts with the same tables, enums, relations and client defaults. Runs in your browser.',
    lead: 'Paste schema.prisma; get a Drizzle schema.ts for the same database, relations included.',
    exampleInput: CONVERT_EXAMPLES.tasksPrisma.source,
    intro: [
      'Switching from Prisma to Drizzle should not mean changing the database. This converter reads schema.prisma and writes a Drizzle schema for the tables Prisma already created: the same table and column names (from `@@map` and `@map`), the same constraint names (`Task_pkey`, `Task_projectId_fkey`), and the same types, so drizzle-kit sees no difference to migrate.',
      'Prisma enums become `pgEnum` declarations, and Prisma’s relation fields become Drizzle `relations()`: a field with `@relation(fields: …)` becomes `one()`, and its list counterpart becomes `many()`. Named relations such as a task’s subtasks keep their pairing through a `relationName`. Explicit join models, like `TaskLabel` here, stay ordinary tables with a composite primary key.',
      'Values Prisma Client fills in itself are carried over as Drizzle hooks rather than lost: `@default(uuid())` becomes `.$defaultFn(() => crypto.randomUUID())` and `@updatedAt` becomes `.$onUpdate(() => new Date())`.',
      'A low-risk way to switch: install `drizzle-orm` and `drizzle-kit`, save the output as your schema, and point both ORMs at the same database while you move queries over one at a time. Drizzle does not touch Prisma’s `_prisma_migrations` table, so you can keep it until the switch is done. Before relying on drizzle-kit, run `npx drizzle-kit push --strict`: it compares the schema with the live database and asks before applying anything, and it should find nothing to change.',
    ],
    mapping: {
      heading: 'Prisma to Drizzle (PostgreSQL)',
      columns: ['Prisma', 'Drizzle'],
      rows: [
        { source: 'String', target: 'text()', expect: "text('col')" },
        {
          source: 'String @db.VarChar(80)',
          target: 'varchar({ length: 80 })',
          expect: "varchar('col', { length: 80 })",
        },
        { source: 'Int', target: 'integer()', expect: "integer('col')" },
        {
          source: 'BigInt',
          target: "bigint({ mode: 'number' })",
          expect: "bigint('col', { mode: 'number' })",
        },
        { source: 'Float', target: 'doublePrecision()', expect: "doublePrecision('col')" },
        {
          source: 'Decimal',
          target: 'numeric({ precision: 65, scale: 30 })',
          expect: "numeric('col', { precision: 65, scale: 30 })",
        },
        { source: 'Boolean', target: 'boolean()', expect: "boolean('col')" },
        {
          source: 'DateTime',
          target: 'timestamp({ precision: 3 })',
          expect: "timestamp('col', { precision: 3 })",
        },
        { source: 'Json', target: 'jsonb()', expect: "jsonb('col')" },
        { source: 'String @db.Uuid', target: 'uuid()', expect: "uuid('col')" },
        {
          source: 'String @default(uuid())',
          target: '.$defaultFn(() => crypto.randomUUID())',
        },
        { source: 'DateTime @updatedAt', target: '.$onUpdate(() => new Date())' },
      ],
    },
    gotchas: [
      {
        title: 'Foreign keys keep ON UPDATE CASCADE',
        body: "Prisma Migrate creates foreign keys with `ON UPDATE CASCADE` by default, so the Drizzle schema keeps `.onUpdate('cascade')` to describe the database exactly as it is.",
      },
      {
        title: 'cuid() and nanoid() need a library',
        body: 'There is no built-in equivalent, so the converter flags those columns; add `.$defaultFn()` with a package such as `@paralleldrive/cuid2`.',
      },
      {
        title: 'Implicit many-to-many becomes a real table',
        body: 'Prisma’s hidden `_AToB` join table is written out explicitly, and you query it like any other table in Drizzle.',
      },
      {
        title: 'Relation names come from columns',
        body: 'Drizzle relation keys are derived from the foreign key columns, which can differ from your Prisma field names; rename them freely, the database is unaffected.',
      },
    ],
    faq: [
      {
        question: 'Will drizzle-kit want to change my database?',
        answer:
          'It should not: table, column and constraint names follow what Prisma Migrate created. Run drizzle-kit generate once and review the result to confirm.',
      },
      {
        question: 'Does it support Prisma with MySQL?',
        answer:
          'Yes. A mysql datasource produces mysqlTable definitions with mysqlEnum columns from drizzle-orm/mysql-core.',
      },
      {
        question: 'Is my schema uploaded?',
        answer: 'No. Everything runs in your browser.',
      },
    ],
    related: ['sql-to-drizzle', 'prisma-to-sql', 'prisma-to-erd'],
    guides: [
      { href: '/features/migrations', label: 'Migrations in Prisma or Drizzle format' },
      { href: '/guides/postgres/drop-column', label: 'Dropping a column safely' },
    ],
  },
  {
    slug: 'dbml-to-sql',
    from: 'dbml',
    to: 'sql',
    category: 'dbml',
    title: 'DBML to SQL converter',
    h1: 'Convert DBML to SQL',
    description:
      'Turn DBML from dbdiagram.io into PostgreSQL or MySQL CREATE TABLE statements, with enums, foreign keys, composite keys and comments. Free, runs in your browser.',
    lead: 'Paste DBML from dbdiagram.io; get CREATE statements for PostgreSQL or MySQL.',
    exampleInput: CONVERT_EXAMPLES.shopDbml.source,
    intro: [
      'DBML is a pleasant way to sketch a schema, and dbdiagram.io is a popular place to do it, but at some point the design has to become real tables. This converter turns DBML into DDL you can run: tables with their keys and defaults, enums, indexes and foreign keys, plus `COMMENT ON` statements for your notes.',
      "The dialect comes from the `Project` block. `database_type: 'PostgreSQL'` (the default when there is none) gives PostgreSQL DDL, where `[increment]` becomes `GENERATED BY DEFAULT AS IDENTITY`; `database_type: 'MySQL'` gives MySQL DDL with `AUTO_INCREMENT`. References are written as `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` after every table exists, so they work whatever order your tables are in, and inline `ref:` settings and standalone `Ref:` lines produce the same result.",
      'DBML has no type system of its own: column types are passed through as you wrote them. Write the type names of your target database (`timestamptz`, `jsonb`, `tinyint(1)`) and they reach the SQL unchanged.',
      'A useful loop is to keep the DBML in your repository as the design, convert it whenever it changes, and review the SQL in the same pull request. For a database that already exists, compare the output with your current schema instead of running it, since `CREATE TABLE` fails on tables that are already there; the DashDB editor can generate the migration between the two. To change dialect later, edit `database_type` and any type names that only one database understands.',
    ],
    mapping: {
      heading: 'DBML to SQL',
      columns: ['DBML', 'SQL (PostgreSQL)'],
      rows: [
        {
          source: 'Table products { … }',
          target: 'CREATE TABLE products (…)',
          sample: 'Table products {\n  id int\n}',
          expect: 'CREATE TABLE products (',
        },
        {
          source: 'id int [pk, increment]',
          target: 'id int GENERATED BY DEFAULT AS IDENTITY',
          sample: 'Table t {\n  id int [pk, increment]\n}',
        },
        {
          source: 'sku varchar [unique]',
          target: 'CONSTRAINT t_sku_key UNIQUE (sku)',
          sample: 'Table t {\n  sku varchar(32) [unique]\n}',
        },
        {
          source: 'created_at timestamp [default: `now()`]',
          target: 'DEFAULT now()',
          sample: 'Table t {\n  created_at timestamp [default: `now()`]\n}',
        },
        {
          source: 'Enum status { … }',
          target: 'CREATE TYPE status AS ENUM (…)',
          sample: 'Enum status {\n  a\n  b\n}\nTable t {\n  s status\n}',
          expect: "CREATE TYPE status AS ENUM ('a', 'b')",
        },
        {
          source: 'order_id int [ref: > orders.id]',
          target: 'FOREIGN KEY (order_id) REFERENCES orders (id)',
          sample:
            'Table orders {\n  id int [pk]\n}\nTable t {\n  order_id int [ref: > orders.id]\n}',
        },
        {
          source: 'Ref: t.a > o.id [delete: cascade]',
          target: 'ON DELETE CASCADE',
          sample:
            'Table o {\n  id int [pk]\n}\nTable t {\n  a int\n}\nRef: t.a > o.id [delete: cascade]',
        },
        {
          source: '(a, b) [pk]',
          target: 'PRIMARY KEY (a, b)',
          sample: 'Table t {\n  a int\n  b int\n  indexes {\n    (a, b) [pk]\n  }\n}',
        },
        {
          source: "Note: 'Sellable items'",
          target: "COMMENT ON TABLE t IS 'Sellable items'",
          sample: "Table t {\n  id int\n  Note: 'Sellable items'\n}",
        },
      ],
    },
    gotchas: [
      {
        title: 'Unnamed constraints get conventional names',
        body: 'DBML rarely names keys, so the SQL uses PostgreSQL’s own naming scheme, such as `products_sku_key` and `order_items_order_id_fkey`, which keeps later migrations predictable.',
      },
      {
        title: 'Many-to-many refs are skipped',
        body: 'A `<>` reference has no foreign key to create. Model the join table explicitly; the converter tells you when it skips one.',
      },
      {
        title: 'Table groups and colors are visual only',
        body: '`TableGroup`, header colors and sticky notes shape the diagram, not the database, so they do not appear in the SQL.',
      },
    ],
    faq: [
      {
        question: 'Does it work with DBML exported from dbdiagram.io?',
        answer:
          'Yes. It uses the same DBML parser as dbdiagram.io, so any file it accepts converts here.',
      },
      {
        question: 'How do I get MySQL output?',
        answer:
          "Add a Project block with database_type: 'MySQL'. Without one, the output is PostgreSQL.",
      },
      {
        question: 'Can I edit the result visually?',
        answer:
          'Yes. Open it in the DashDB editor to see the tables on a canvas, change them, and generate migrations from your edits.',
      },
    ],
    related: ['sql-to-dbml', 'postgres-to-mysql', 'sql-to-mermaid'],
    guides: [
      { href: '/features/diagram', label: 'Design the schema on a canvas' },
      {
        href: '/guides/postgres/create-index-blocking',
        label: 'Creating indexes without blocking writes',
      },
    ],
  },
  {
    slug: 'sql-to-dbml',
    from: 'sql',
    to: 'dbml',
    category: 'dbml',
    title: 'SQL to DBML converter',
    h1: 'Convert SQL to DBML',
    description:
      'Convert PostgreSQL or MySQL CREATE TABLE statements to DBML for dbdiagram.io: tables, refs with ON DELETE rules, indexes, checks, enums and notes. Free and in-browser.',
    lead: 'Paste DDL; get DBML you can open in dbdiagram.io or keep next to your docs.',
    exampleInput: CONVERT_EXAMPLES.eventsPostgres.source,
    intro: [
      'DBML is easier to read than DDL and easier to diagram, which makes it a good format for documentation and design reviews. This converter takes the CREATE statements you already have and writes DBML: a `Table` block per table, column settings in brackets, and one named `Ref` line per foreign key, carrying its `ON DELETE` and `ON UPDATE` rules.',
      'Comments are not lost. `COMMENT ON TABLE` becomes the table’s `Note`, and `COMMENT ON COLUMN` becomes a `note:` setting on the column. Indexes go into an `indexes` block, multi-column ones as `(event_id, seat)`, and CHECK constraints into a `checks` block. Serial and identity columns are marked `[pk, increment]`, and expression defaults such as `now()` are wrapped in backticks, which is how DBML marks an expression.',
      'A `Project` block records the source dialect as `database_type`, so converting the DBML back to SQL produces the same dialect you started with.',
      'Paste the result into dbdiagram.io for a diagram you can share, or commit it next to your migrations as readable documentation of the schema. Conversion takes milliseconds, so regenerating is cheap whenever the schema changes: dump the schema-only DDL with `pg_dump --schema-only` or `mysqldump --no-data`, paste it here and replace the old file. Reviewers can then read a short DBML diff instead of a long one in SQL.',
    ],
    mapping: {
      heading: 'SQL to DBML',
      columns: ['SQL', 'DBML'],
      rows: [
        {
          source: 'id serial PRIMARY KEY',
          target: 'id integer [pk, increment]',
          sample: 'CREATE TABLE t (id serial PRIMARY KEY);',
        },
        {
          source: 'NOT NULL UNIQUE',
          target: '[not null, unique]',
          sample: 'CREATE TABLE t (email text NOT NULL UNIQUE);',
        },
        {
          source: 'DEFAULT false',
          target: '[default: false]',
          sample: 'CREATE TABLE t (b boolean DEFAULT false);',
        },
        {
          source: 'DEFAULT now()',
          target: '[default: `now()`]',
          sample: 'CREATE TABLE t (at timestamptz DEFAULT now());',
        },
        {
          source: 'REFERENCES venues (id) ON DELETE RESTRICT',
          target: 'Ref t_venue_id_fkey: t.venue_id > venues.id [delete: restrict]',
          sample:
            'CREATE TABLE venues (id int PRIMARY KEY);\nCREATE TABLE t (venue_id int REFERENCES venues (id) ON DELETE RESTRICT);',
        },
        {
          source: "COMMENT ON TABLE t IS '…'",
          target: "Note: 'Places that host events'",
          sample: "CREATE TABLE t (id int);\nCOMMENT ON TABLE t IS 'Places that host events';",
        },
        {
          source: "COMMENT ON COLUMN t.c IS '…'",
          target: "[note: 'Stored in UTC']",
          sample: "CREATE TABLE t (c timestamptz);\nCOMMENT ON COLUMN t.c IS 'Stored in UTC';",
        },
        {
          source: 'CREATE UNIQUE INDEX … (a, b)',
          target: "(a, b) [name: 'ab_key', unique]",
          sample: 'CREATE TABLE t (a int, b int);\nCREATE UNIQUE INDEX ab_key ON t (a, b);',
        },
        {
          source: 'CHECK (n > 0)',
          target: '`n > 0`',
          sample: 'CREATE TABLE t (n int CHECK (n > 0));',
        },
        {
          source: 'CREATE TYPE mood AS ENUM (…)',
          target: 'Enum mood { … }',
          sample: "CREATE TYPE mood AS ENUM ('ok', 'sad');\nCREATE TABLE t (m mood);",
          expect: 'Enum mood {',
        },
      ],
    },
    gotchas: [
      {
        title: 'Serial columns come back as identity columns',
        body: 'DBML only knows `increment`, so converting the DBML back to SQL gives `GENERATED BY DEFAULT AS IDENTITY` instead of the original `serial`. Both behave the same for inserts.',
      },
      {
        title: 'Partial indexes lose their WHERE clause',
        body: 'DBML has no syntax for it, so the index is kept without the condition and the converter warns you.',
      },
      {
        title: 'Named unique constraints become indexes',
        body: 'DBML marks uniqueness on a column or an index, not as a named constraint; MySQL `UNIQUE KEY` names are kept on the index instead.',
      },
      {
        title: 'Engine and storage settings are dropped',
        body: 'Table options such as `ENGINE=InnoDB` or tablespace settings have no DBML equivalent.',
      },
    ],
    faq: [
      {
        question: 'Can I paste the DBML into dbdiagram.io?',
        answer:
          'Yes. The output is standard DBML; paste it into dbdiagram.io or any tool that reads DBML to get a diagram.',
      },
      {
        question: 'Does it read MySQL?',
        answer:
          "Yes. MySQL DDL is detected automatically and the Project block says database_type: 'MySQL'.",
      },
      {
        question: 'Is my SQL sent anywhere?',
        answer: 'No. Conversion runs in your browser.',
      },
    ],
    related: ['dbml-to-sql', 'sql-to-mermaid', 'sql-to-prisma'],
    guides: [
      { href: '/features/diagram', label: 'A visual editor for the same schema' },
      { href: '/guides/postgres/drop-table', label: 'Dropping a table safely' },
    ],
  },
  {
    slug: 'sql-to-mermaid',
    from: 'sql',
    to: 'mermaid',
    category: 'diagrams',
    title: 'SQL to Mermaid ER diagram converter',
    h1: 'Convert SQL to a Mermaid ER diagram',
    description:
      'Generate a Mermaid erDiagram from PostgreSQL or MySQL CREATE TABLE statements, with PK/FK/UK markers and one-to-one, one-to-many and optional relationships.',
    lead: 'Paste CREATE TABLE statements; get a Mermaid erDiagram that GitHub, GitLab and Notion render.',
    exampleInput: CONVERT_EXAMPLES.libraryPostgres.source,
    intro: [
      'Mermaid diagrams live as text inside Markdown, so an ER diagram in your README stays in version control and changes in the same pull request as the schema. Paste the result into a fenced code block marked `mermaid` and GitHub, GitLab, Notion and Obsidian draw it for you.',
      'Each table becomes an entity listing its columns with their types and key markers: `PK` for primary keys, `FK` for foreign keys and `UK` for columns that are unique on their own. Each foreign key becomes a relationship line labelled with the constraint name, and its crow’s-foot ends are worked out from your constraints rather than guessed. A `NOT NULL` foreign key means every row has exactly one parent (`||`), a nullable one makes the parent optional (`|o`), and a foreign key that is also unique, such as `library_cards.member_id`, makes the relationship one-to-one (`o|`).',
      'Mermaid is strict about identifiers, so names with spaces or symbols are cleaned and the real name is kept as a display label: `"Order Items"` becomes `Order_Items["Order Items"]`. Types keep their parameters, with commas swapped for underscores (`numeric(10_2)`).',
      'To keep the diagram current, regenerate it whenever a migration changes the schema: dump the DDL with `pg_dump --schema-only` or `mysqldump --no-data`, paste it here and replace the block in your README. For a focused view, paste only the tables that matter to the reader; foreign keys that point at tables you left out are simply not drawn, and the converter mentions each one it skips.',
    ],
    mapping: {
      heading: 'SQL constraints to Mermaid notation',
      columns: ['SQL', 'Mermaid'],
      rows: [
        {
          source: 'id serial PRIMARY KEY',
          target: 'integer id PK',
          sample: 'CREATE TABLE t (id serial PRIMARY KEY);',
        },
        {
          source: 'REFERENCES authors (id)',
          target: 'integer author_id FK',
          sample:
            'CREATE TABLE authors (id int PRIMARY KEY);\nCREATE TABLE t (author_id integer REFERENCES authors (id));',
        },
        {
          source: 'UNIQUE',
          target: 'text email UK',
          sample: 'CREATE TABLE t (email text UNIQUE);',
        },
        {
          source: 'NOT NULL foreign key',
          target: 'a ||--o{ b',
          sample:
            'CREATE TABLE a (id int PRIMARY KEY);\nCREATE TABLE b (a_id int NOT NULL REFERENCES a (id));',
        },
        {
          source: 'nullable foreign key',
          target: 'a |o--o{ b',
          sample:
            'CREATE TABLE a (id int PRIMARY KEY);\nCREATE TABLE b (a_id int REFERENCES a (id));',
        },
        {
          source: 'unique foreign key (one-to-one)',
          target: 'a ||--o| b',
          sample:
            'CREATE TABLE a (id int PRIMARY KEY);\nCREATE TABLE b (a_id int PRIMARY KEY REFERENCES a (id));',
        },
        {
          source: 'numeric(10,2)',
          target: 'numeric(10_2)',
          sample: 'CREATE TABLE t (n numeric(10,2));',
        },
        {
          source: 'CREATE TABLE "Order Items"',
          target: 'Order_Items["Order Items"]',
          sample: 'CREATE TABLE "Order Items" (id int);',
        },
      ],
    },
    gotchas: [
      {
        title: 'Self-references are drawn as loops',
        body: 'A table that points at itself, like `books.sequel_of`, gets a relationship line from the table back to itself, labelled with the constraint name.',
      },
      {
        title: 'Enums, indexes and defaults are not drawn',
        body: 'ER diagrams show structure, not physical details. Enum columns show the enum’s name as their type, and the converter notes what it leaves out.',
      },
      {
        title: 'Large schemas get crowded',
        body: 'Mermaid lays out the whole diagram at once. For more than about twenty tables, convert one area at a time.',
      },
    ],
    faq: [
      {
        question: 'Where can I paste the result?',
        answer:
          'Anywhere that renders Mermaid: a fenced mermaid code block on GitHub or GitLab, Notion, Obsidian, Confluence with the Mermaid app, or the Mermaid Live Editor.',
      },
      {
        question: 'Does it support composite foreign keys?',
        answer:
          'Yes. Every column in the key is marked FK, and the relationship is drawn once between the two tables.',
      },
      {
        question: 'Is my SQL uploaded?',
        answer: 'No. The diagram is generated in your browser.',
      },
    ],
    related: ['prisma-to-erd', 'sql-to-dbml', 'sql-to-prisma'],
    guides: [
      { href: '/features/diagram', label: 'An interactive diagram you can edit' },
      {
        href: '/guides/postgres/add-fk-validating',
        label: 'Adding foreign keys to existing tables',
      },
    ],
  },
  {
    slug: 'prisma-to-erd',
    from: 'prisma',
    to: 'mermaid',
    category: 'diagrams',
    title: 'Prisma ERD generator',
    h1: 'Generate an ER diagram from a Prisma schema',
    description:
      'Visualize schema.prisma as an entity relationship diagram: tables, keys and relations. Download an SVG or copy Mermaid for your README. Free, in-browser.',
    lead: 'Paste schema.prisma; see the entity relationship diagram, download it as SVG, or copy it as Mermaid.',
    exampleInput: CONVERT_EXAMPLES.socialPrisma.source,
    diagram: true,
    intro: [
      'A Prisma schema describes relations from both ends at once, `author User @relation(…)` on one model and `posts Post[]` on the other, which is precise but hard to picture once a schema grows. This generator draws the diagram the schema implies: one box per table, its columns with key markers, and a line per relationship.',
      'The diagram shows the database Prisma creates, not the Prisma Client API. Boxes are named after the table (respecting `@@map`), columns use their database names and types, and relation fields such as `posts Post[]` are not listed as columns: they appear as the relationship lines instead. Compound keys from `@@id([followerId, followingId])` mark both columns `PK`, and a self-relation like followers and following draws two lines between the same tables.',
      'You get the diagram twice: as an image, laid out automatically and downloadable as SVG for docs and slides, and as Mermaid `erDiagram` text that renders on GitHub, GitLab and Notion, so the diagram can live in your repository and change with the schema.',
      'Paste the whole schema, including the `datasource` block, so the types match what your database really stores. For a schema with many models the SVG is easier to read than the Mermaid version, because related tables are placed next to each other and the image stays sharp when zoomed. To change the design rather than look at it, open the schema in the DashDB editor: you can rearrange and edit the tables on a canvas, then generate the migration for your change.',
    ],
    mapping: {
      heading: 'Prisma to ER diagram',
      columns: ['Prisma', 'ER diagram (Mermaid)'],
      rows: [
        {
          source: 'id Int @id',
          target: 'int id PK',
          sample:
            'datasource db {\n  provider = "mysql"\n  url = env("DATABASE_URL")\n}\nmodel T {\n  id Int @id\n}',
        },
        {
          source: '@@id([a, b])',
          target: 'int a PK',
          sample:
            'datasource db {\n  provider = "mysql"\n  url = env("DATABASE_URL")\n}\nmodel T {\n  a Int\n  b Int\n  @@id([a, b])\n}',
        },
        {
          source: 'handle String @unique @db.VarChar(30)',
          target: 'varchar(30) handle UK',
          sample:
            'datasource db {\n  provider = "mysql"\n  url = env("DATABASE_URL")\n}\nmodel T {\n  id Int @id\n  handle String @unique @db.VarChar(30)\n}',
        },
        {
          source: 'required relation',
          target: 'User ||--o{ Post',
          sample:
            'model User {\n  id Int @id\n  posts Post[]\n}\nmodel Post {\n  id Int @id\n  authorId Int\n  author User @relation(fields: [authorId], references: [id])\n}',
        },
        {
          source: 'optional relation (Int?)',
          target: 'User |o--o{ Post',
          sample:
            'model User {\n  id Int @id\n  posts Post[]\n}\nmodel Post {\n  id Int @id\n  authorId Int?\n  author User? @relation(fields: [authorId], references: [id])\n}',
        },
        {
          source: 'one-to-one (@unique)',
          target: 'User ||--o| Profile',
          sample:
            'model User {\n  id Int @id\n  profile Profile?\n}\nmodel Profile {\n  id Int @id\n  userId Int @unique\n  user User @relation(fields: [userId], references: [id])\n}',
        },
        {
          source: '@@map("users")',
          target: 'users {',
          sample: 'model User {\n  id Int @id\n  @@map("users")\n}',
        },
      ],
    },
    gotchas: [
      {
        title: 'Implicit many-to-many shows the hidden table',
        body: 'Two list fields pointing at each other create a `_AToB` join table in the database, so the diagram shows it, with columns `A` and `B`.',
      },
      {
        title: 'Types are database types',
        body: 'A `String` appears as `text` in PostgreSQL or `varchar(191)` in MySQL, because the diagram reflects the actual columns.',
      },
    ],
    faq: [
      {
        question: 'How do I add the diagram to my README?',
        answer:
          'Copy the Mermaid tab into a fenced code block marked mermaid. GitHub and GitLab render it automatically, and it stays in sync with your schema in the same pull requests.',
      },
      {
        question: 'Can I download the diagram as an image?',
        answer:
          'Yes. The Diagram tab has a Download SVG button; SVG stays sharp at any size in docs and slides.',
      },
      {
        question: 'Is my Prisma schema uploaded?',
        answer: 'No. Parsing, layout and drawing all happen in your browser.',
      },
    ],
    related: ['sql-to-mermaid', 'prisma-to-sql', 'prisma-to-drizzle'],
    guides: [
      { href: '/features/diagram', label: 'Edit the diagram, then generate migrations' },
      {
        href: '/guides/postgres/rename-breaks-app',
        label: 'Renaming columns without breaking the app',
      },
    ],
  },
] as const satisfies readonly ToolDefinition[];

export type ToolSlug = (typeof TOOLS)[number]['slug'];

export function findTool(slug: string): ToolDefinition | undefined {
  const tools: readonly ToolDefinition[] = TOOLS;
  return tools.find((t) => t.slug === slug);
}

export function toolsIn(category: ToolCategory): ToolDefinition[] {
  const tools: readonly ToolDefinition[] = TOOLS;
  return tools.filter((t) => t.category === category);
}

/** Words of explanation on the page: intro paragraphs plus gotchas (registry.test.ts: 300-500). */
export function explanationWords(tool: ToolDefinition): number {
  const text = [...tool.intro, ...tool.gotchas.flatMap((g) => [g.title, g.body])].join(' ');
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}
