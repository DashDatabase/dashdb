// A small SQL tokenizer for read-only highlighting in the Migration panel. Rendered as React
// text nodes, never as HTML, so generated identifiers can't inject markup.

export type SqlTokenKind =
  'keyword' | 'type' | 'string' | 'identifier' | 'number' | 'comment' | 'punctuation' | 'plain';

export interface SqlToken {
  readonly kind: SqlTokenKind;
  readonly text: string;
}

const KEYWORDS = new Set(
  (
    'add all alter and as asc begin by cascade check column commit concurrently constraint create ' +
    'default delete desc distinct drop enum exists foreign from if in index insert into is key ' +
    'limit modify not null on or primary references rename restrict schema select set table to ' +
    'transaction type unique update using validate valid values where with comment after before ' +
    'algorithm lock inplace instant copy shared none action no change first engine auto_increment ' +
    'generated always identity value collate charset character returning'
  ).split(' '),
);

const TYPES = new Set(
  (
    'int integer bigint smallint serial bigserial decimal numeric real double float boolean bool ' +
    'text varchar char uuid json jsonb timestamp timestamptz date time bytea blob tinyint ' +
    'mediumint longtext mediumtext datetime binary varbinary precision zone'
  ).split(' '),
);

const PATTERNS: readonly [SqlTokenKind, RegExp][] = [
  ['comment', /--[^\n]*/y],
  ['comment', /\/\*[\s\S]*?(?:\*\/|$)/y],
  ['string', /'(?:[^']|'')*'?/y],
  ['identifier', /"(?:[^"]|"")*"?/y],
  ['identifier', /`(?:[^`]|``)*`?/y],
  ['number', /\d[\d.]*/y],
  ['plain', /[A-Za-z_][\w$]*/y],
  ['plain', /\s+/y],
  ['punctuation', /[(),;.]/y],
];

export function tokenizeSql(text: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let index = 0;
  const push = (kind: SqlTokenKind, value: string) => {
    const last = tokens.at(-1);
    // Merge neighbouring plain text so the rendered tree stays small.
    if (kind === 'plain' && last?.kind === 'plain') {
      tokens[tokens.length - 1] = { kind, text: last.text + value };
    } else tokens.push({ kind, text: value });
  };
  while (index < text.length) {
    let matched = false;
    for (const [kind, pattern] of PATTERNS) {
      pattern.lastIndex = index;
      const match = pattern.exec(text);
      if (!match || match[0].length === 0) continue;
      const value = match[0];
      let resolved = kind;
      if (kind === 'plain' && /^[A-Za-z_]/.test(value)) {
        const lower = value.toLowerCase();
        if (KEYWORDS.has(lower)) resolved = 'keyword';
        else if (TYPES.has(lower)) resolved = 'type';
      }
      push(resolved, value);
      index += value.length;
      matched = true;
      break;
    }
    if (!matched) {
      push('plain', text.charAt(index));
      index += 1;
    }
  }
  return tokens;
}
