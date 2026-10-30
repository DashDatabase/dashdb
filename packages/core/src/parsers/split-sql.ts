export type SqlFlavor = 'postgres' | 'mysql';

export interface SqlStatement {
  /** Statement text from its first code character, without the terminating delimiter. */
  readonly text: string;
  /** Offset of `text` within the full source. */
  readonly offset: number;
}

/** `$$` or `$tag$` at the start of `text`. */
function dollarTag(text: string): string | null {
  if (text.startsWith('$$')) return '$$';
  return /^\$[A-Za-z_]\w*\$/.exec(text)?.[0] ?? null;
}

/**
 * Split a SQL script into statements, respecting string literals, quoted identifiers,
 * comments, Postgres dollar-quoted bodies and MySQL `DELIMITER` changes. Comment-only chunks
 * are dropped. Postgres `COPY … FROM stdin` data blocks and psql `\` meta-commands are skipped.
 */
export function splitSql(source: string, flavor: SqlFlavor): SqlStatement[] {
  const statements: SqlStatement[] = [];
  const mysql = flavor === 'mysql';
  let delimiter = ';';
  let start = -1; // offset of the first code character of the current statement
  let i = 0;

  const flush = (end: number) => {
    if (start !== -1) {
      const text = source.slice(start, end).trimEnd();
      if (text) statements.push({ text, offset: start });
    }
    start = -1;
  };

  const lineEnd = (from: number) => {
    const nl = source.indexOf('\n', from);
    return nl === -1 ? source.length : nl;
  };

  while (i < source.length) {
    const ch = source[i] as string;
    const next = source[i + 1];

    // Whitespace and comments never start a statement.
    if (ch === '-' && next === '-') {
      i = lineEnd(i);
      continue;
    }
    if (mysql && ch === '#') {
      i = lineEnd(i);
      continue;
    }
    if (ch === '/' && next === '*') {
      // MySQL `/*!40101 … */` executable comments are treated as comments too.
      let depth = 1;
      i += 2;
      while (i < source.length && depth > 0) {
        if (!mysql && source[i] === '/' && source[i + 1] === '*') {
          depth++; // Postgres block comments nest.
          i += 2;
        } else if (source[i] === '*' && source[i + 1] === '/') {
          depth--;
          i += 2;
        } else i++;
      }
      continue;
    }
    if (start === -1) {
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (mysql && /^delimiter\s/i.test(source.slice(i, i + 10))) {
        const end = lineEnd(i);
        delimiter = source.slice(i + 9, end).trim() || ';';
        i = end;
        continue;
      }
      if (!mysql && ch === '\\') {
        i = lineEnd(i); // psql meta-command such as \connect
        continue;
      }
      start = i;
    }

    if (source.startsWith(delimiter, i)) {
      const text = source.slice(start, i);
      flush(i);
      i += delimiter.length;
      if (!mysql && /^copy\b[\s\S]*\bfrom\s+stdin\b/i.test(text)) {
        // Skip the data block up to the terminating `\.` line.
        const terminator = source.indexOf('\n\\.', i);
        i = terminator === -1 ? source.length : lineEnd(terminator + 1);
      }
      continue;
    }

    if (ch === "'" || ch === '"' || (mysql && ch === '`')) {
      i = skipQuoted(source, i, ch, mysql && ch !== '`');
      continue;
    }
    if (!mysql && ch === '$') {
      const tag = dollarTag(source.slice(i, i + 64));
      if (tag) {
        const close = source.indexOf(tag, i + tag.length);
        i = close === -1 ? source.length : close + tag.length;
        continue;
      }
    }
    i++;
  }
  flush(source.length);
  return statements;
}

/** Return the offset just past the quoted run starting at `from`. Doubled quotes escape. */
function skipQuoted(
  source: string,
  from: number,
  quote: string,
  backslashEscapes: boolean,
): number {
  let i = from + 1;
  while (i < source.length) {
    const ch = source[i];
    if (backslashEscapes && ch === '\\') {
      i += 2;
    } else if (ch === quote) {
      if (source[i + 1] === quote) i += 2;
      else return i + 1;
    } else i++;
  }
  return source.length;
}

/** Words allowed between CREATE and the object kind (`CREATE GLOBAL TEMPORARY TABLE`). */
const CREATE_MODIFIERS = new Set(['GLOBAL', 'LOCAL', 'TEMP', 'TEMPORARY', 'UNLOGGED', 'UNIQUE']);
const MODELED_OBJECTS = new Set(['TABLE', 'INDEX', 'TYPE', 'SCHEMA', 'DATABASE']);

/**
 * Whether a statement defines schema structure we model. Parse failures in these are errors;
 * failures anywhere else (GRANT, CREATE TRIGGER, …) only mean the statement is unsupported.
 */
export function isSchemaStatement(text: string): boolean {
  const [first, second, ...rest] = leadingKeywords(text, 5).toUpperCase().split(' ');
  if (first === 'ALTER') return second === 'TABLE';
  if (first === 'COMMENT') return second === 'ON';
  if (first !== 'CREATE') return false;
  for (const word of [second, ...rest]) {
    if (word === undefined || !CREATE_MODIFIERS.has(word))
      return word !== undefined && MODELED_OBJECTS.has(word);
  }
  return false;
}

/** Leading words of a statement, for messages (comments already stripped by the splitter). */
export function leadingKeywords(text: string, count = 3): string {
  return text.slice(0, 200).split(/[\s(]/).filter(Boolean).slice(0, count).join(' ');
}
