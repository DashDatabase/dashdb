// The schema as a Mermaid `erDiagram`, for READMEs, issues and docs (GitHub, GitLab and Notion
// render it). Entities list typed columns with PK/FK/UK markers; relationships carry cardinality.
import { cardinality, columnFlags, type Cardinality } from '../ir/relations';
import type { Schema, Table } from '../ir/types';
import type { SerializeResult, SerializeWarning } from './types';

/** Mermaid identifiers: letters, digits, `_` and `-`; anything else becomes `_`. */
function word(text: string): string {
  const cleaned = text.replace(/[^A-Za-z0-9_-]+/g, '_');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
}

/** Attribute types also allow parentheses and brackets (`varchar(255)`, `int[]`). */
function typeWord(text: string): string {
  const cleaned = text.replace(/,\s*/g, '_').replace(/[^A-Za-z0-9_\-()[\]]+/g, '_');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
}

/** Mermaid strings cannot escape a double quote, so it becomes a single one; no line breaks. */
function quoted(text: string): string {
  return `"${text.replace(/"/g, "'").replace(/\s+/g, ' ').trim()}"`;
}

// Markers are written parent-side then child-side: `PARENT ||--o{ CHILD`.
const PARENT_MARKER: Record<Cardinality, string> = { one: '||', 'zero-one': '|o', many: '}o' };
const CHILD_MARKER: Record<Cardinality, string> = { one: '||', 'zero-one': 'o|', many: 'o{' };

/**
 * Render the schema as a Mermaid `erDiagram`. Mermaid has no notation for enums, indexes,
 * checks or defaults; they are reported as warnings (enum-typed columns keep the enum's name).
 */
export function toMermaid(schema: Schema): SerializeResult {
  const multiNamespace = new Set(schema.tables.map((t) => t.namespace)).size > 1;
  const namespaceName = new Map(schema.namespaces.map((n) => [n.id, n.name]));
  const display = (t: Table) =>
    multiNamespace ? `${namespaceName.get(t.namespace) ?? ''}.${t.name}` : t.name;

  // Entity ids are unique even when two names clean up to the same word.
  const ids = new Map<string, string>();
  const taken = new Set<string>();
  for (const table of schema.tables) {
    const base = word(display(table));
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}_${String(n)}`;
    taken.add(id);
    ids.set(table.id, id);
  }

  const lines = ['erDiagram'];
  for (const table of schema.tables) {
    const id = ids.get(table.id) ?? '';
    const label = display(table);
    // An alias shows the real name when the identifier had to change.
    const head = id === label ? id : `${id}[${quoted(label)}]`;
    if (table.columns.length === 0) {
      lines.push(`  ${head} {`, '  }');
      continue;
    }
    lines.push(`  ${head} {`);
    for (const column of table.columns) {
      const flags = columnFlags(table, column);
      const keys = [flags.pk && 'PK', flags.fk && 'FK', flags.unique && !flags.pk && 'UK'].filter(
        Boolean,
      );
      const parts = [typeWord(column.nativeType), word(column.name)];
      if (keys.length) parts.push(keys.join(', '));
      if (column.comment) parts.push(quoted(column.comment));
      lines.push(`    ${parts.join(' ')}`);
    }
    lines.push('  }');
  }

  const byId = new Map(schema.tables.map((t) => [t.id, t]));
  for (const table of schema.tables) {
    for (const fk of table.foreignKeys) {
      const parent = byId.get(fk.refTable);
      if (!parent) continue;
      const { sourceEnd, targetEnd } = cardinality(table, fk);
      lines.push(
        `  ${ids.get(parent.id) ?? ''} ${PARENT_MARKER[targetEnd]}--${CHILD_MARKER[sourceEnd]} ${ids.get(table.id) ?? ''} : ${quoted(fk.name)}`,
      );
    }
  }
  return { code: `${lines.join('\n')}\n`, warnings: omissions(schema) };
}

/** One warning per kind of omission (not per table): ER diagrams are expected to be partial. */
function omissions(schema: Schema): SerializeWarning[] {
  const warnings: SerializeWarning[] = [];
  if (schema.enums.length > 0) {
    warnings.push({
      code: 'unsupported-feature',
      element: schema.enums.map((e) => e.name).join(', '),
      message: 'Mermaid ER diagrams have no enums; columns show the enum name as their type',
    });
  }
  const lost = [
    schema.tables.some((t) => t.indexes.length > 0) && 'indexes',
    schema.tables.some((t) => t.checks.length > 0) && 'check constraints',
    schema.tables.some((t) => t.columns.some((c) => c.default !== null)) && 'defaults',
  ].filter((x): x is string => typeof x === 'string');
  if (lost.length > 0) {
    warnings.push({
      code: 'unsupported-feature',
      element: '',
      message: `Mermaid ER diagrams show tables, keys and relationships only; ${lost.join(', ')} are left out`,
    });
  }
  return warnings;
}
