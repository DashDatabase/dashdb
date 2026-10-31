// How to run the introspection query in common SQL clients and copy its single result cell.
import type { IntrospectionDialect } from '@dashdb/core';

export interface ClientGuide {
  readonly id: string;
  readonly name: string;
  readonly steps: readonly string[];
  /** A shell command, shown as code. */
  readonly command?: string;
}

export const QUERY_FILE_NAME: Record<IntrospectionDialect, string> = {
  postgres: 'dashdb-introspect-postgres.sql',
  mysql: 'dashdb-introspect-mysql.sql',
};

const copyCell = 'Click the single `result` cell, copy it (Ctrl/⌘+C) and paste it below.';

export const CLIENT_GUIDES: Record<IntrospectionDialect, readonly ClientGuide[]> = {
  postgres: [
    {
      id: 'psql',
      name: 'psql',
      steps: [
        `Download the query as ${QUERY_FILE_NAME.postgres}.`,
        'Run it with unaligned, tuples-only output into a file:',
        'Open schema.json and paste its contents below, or load the file.',
      ],
      command: `psql "postgres://user@host:5432/dbname" -X -A -t -f ${QUERY_FILE_NAME.postgres} -o schema.json`,
    },
    {
      id: 'tableplus',
      name: 'TablePlus',
      steps: [
        'Connect to the database and open a SQL query tab (Ctrl/⌘+E).',
        'Paste the query and run it (Ctrl/⌘+Enter).',
        copyCell,
      ],
    },
    {
      id: 'dbeaver',
      name: 'DBeaver',
      steps: [
        'Select the database, then SQL Editor → New SQL script (Ctrl+]).',
        'Paste the query and execute it (Ctrl+Enter).',
        copyCell,
        'If the value looks cut off, open it in the Value panel (F7) and copy from there.',
      ],
    },
    {
      id: 'pgadmin',
      name: 'pgAdmin',
      steps: [
        'Select the database and open Tools → Query Tool.',
        'Paste the query and execute it (F5).',
        copyCell,
        'If the value looks cut off, raise Preferences → Query Tool → Results grid → “Max column data display length”.',
      ],
    },
  ],
  mysql: [
    {
      id: 'mysql',
      name: 'mysql',
      steps: [
        `Download the query as ${QUERY_FILE_NAME.mysql}.`,
        'Run it against the database you want to import, with raw output and no header:',
        'Open schema.json and paste its contents below, or load the file.',
      ],
      command: `mysql -h host -u user -p --raw --skip-column-names dbname < ${QUERY_FILE_NAME.mysql} > schema.json`,
    },
    {
      id: 'tableplus',
      name: 'TablePlus',
      steps: [
        'Connect and select the database to import, then open a SQL query tab (Ctrl/⌘+E).',
        'Paste the query and run it (Ctrl/⌘+Enter).',
        copyCell,
      ],
    },
    {
      id: 'dbeaver',
      name: 'DBeaver',
      steps: [
        'Select the database (it must be the active catalog), then SQL Editor → New SQL script.',
        'Paste the query and execute it (Ctrl+Enter).',
        copyCell,
        'If the value looks cut off, open it in the Value panel (F7) and copy from there.',
      ],
    },
    {
      id: 'workbench',
      name: 'MySQL Workbench',
      steps: [
        'Double-click the schema to make it the default, then open a new query tab.',
        'Paste the query and execute it (Ctrl/⌘+Enter).',
        'Right-click the `result` cell → Copy Field (unquoted), and paste it below.',
      ],
    },
  ],
};
