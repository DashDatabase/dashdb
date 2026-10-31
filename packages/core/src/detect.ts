// Guess what a piece of schema source is: Prisma, DBML, or SQL (and which SQL dialect). Runs on
// every keystroke and on text from anywhere, so it reads only the start and every pattern is
// bounded against regex backtracking.

/** The source formats DashDB can parse. */
export type SourceFormat = 'postgres' | 'mysql' | 'prisma' | 'dbml';

// Signals that only one dialect writes. Each kind counts once.
const MYSQL_SIGNALS = [
  /`/,
  /\bENGINE\s*=/i,
  /\bAUTO_INCREMENT\b/i,
  /\bUNSIGNED\b/i,
  /\b(TINYINT|MEDIUMINT|MEDIUMTEXT|LONGTEXT|DATETIME)\b/i,
  /\bDEFAULT\s+CHARSET\b/i,
  /\bON\s+UPDATE\s+CURRENT_TIMESTAMP\b/i,
  /\bENUM\s*\(/i,
];
const POSTGRES_SIGNALS = [
  /::\s*[a-z]/i,
  /\b(BIG)?SERIAL\b/i,
  /\bGENERATED\s+(ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i,
  // Bounded, so text full of "CREATE TYPE" without semicolons cannot backtrack quadratically.
  /\bCREATE\s+TYPE\s[^;]{0,200}?\bAS\s+ENUM\b/i,
  /\bCOMMENT\s+ON\b/i,
  /\b(TIMESTAMPTZ|JSONB|BYTEA|UUID)\b/i,
  /\bCREATE\s+(SCHEMA|EXTENSION)\b/i,
  /\$\$/,
];

/** A dialect or format shows itself in the first statements. */
const DETECT_SCAN_CHARS = 64 * 1024;

/** The SQL dialect a script is written in: MySQL when its signals outnumber Postgres's. */
export function detectSqlDialect(text: string): 'postgres' | 'mysql' {
  const head = text.slice(0, DETECT_SCAN_CHARS);
  const score = (signals: readonly RegExp[]) => signals.filter((re) => re.test(head)).length;
  return score(MYSQL_SIGNALS) > score(POSTGRES_SIGNALS) ? 'mysql' : 'postgres';
}

/** Guesses the format of schema source from its contents; SQL by default. */
export function detectSourceFormat(text: string): SourceFormat {
  const head = text.slice(0, DETECT_SCAN_CHARS);
  // Indentation is matched with [ \t]*, not \s*, which would rescan every following line.
  if (/^[ \t]*(datasource|generator|model)[ \t]+\w+[ \t]*\{/m.test(head)) return 'prisma';
  if (
    /^[ \t]*(Table|Ref|Enum|Project)\b[^\n;]{0,200}[{:]/m.test(head) &&
    !/\bCREATE\s+TABLE\b/i.test(head)
  )
    return 'dbml';
  return detectSqlDialect(head);
}
