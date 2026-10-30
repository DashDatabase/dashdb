/** Split `order_items`, `OrderItems`, `orderItems`, `HTTPStatus` into lowercase words. */
export function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

export function pascalCase(name: string): string {
  return words(name).map(capitalize).join('');
}

export function camelCase(name: string): string {
  const [first = '', ...rest] = words(name);
  return first + rest.map(capitalize).join('');
}

/** Words that look plural but are not (or whose singular is the same). */
const UNCOUNTABLE = new Set([
  'data',
  'metadata',
  'news',
  'series',
  'species',
  'status',
  'access',
  'settings',
]);

/**
 * Conservative singularization for table names: `categories` → `category`, `addresses` →
 * `address`, `users` → `user`. Words ending in `ss`, `us` or `is` are left alone.
 */
export function singular(word: string): string {
  const lower = word.toLowerCase();
  if (UNCOUNTABLE.has(lower) || lower.length < 3) return word;
  if (/ies$/i.test(word)) return word.slice(0, -3) + (word.endsWith('IES') ? 'Y' : 'y');
  if (/(ss|sh|ch|x|z)es$/i.test(word)) return word.slice(0, -2);
  if (/(ss|us|is)$/i.test(word)) return word;
  if (/s$/i.test(word)) return word.slice(0, -1);
  return word;
}

export function plural(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|sh|ch|x|z)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

/** `order_items` → `OrderItem`; already-PascalCase names are kept as they are. */
export function modelName(table: string): string {
  if (/^[A-Z][A-Za-z0-9]*$/.test(table)) return table;
  const parts = words(table).map(capitalize);
  const last = parts.pop();
  return [...parts, last === undefined ? '' : singular(last)].join('') || 'Model';
}

/** `created_at` → `createdAt`; already-camelCase names are kept as they are. */
export function fieldName(column: string): string {
  if (/^[a-z][A-Za-z0-9]*$/.test(column)) return column;
  return camelCase(column) || 'field';
}

/** Hands out unique names, appending 2, 3, … on collisions. */
export class NameScope {
  private readonly used = new Set<string>();

  constructor(reserved: Iterable<string> = []) {
    for (const name of reserved) this.used.add(name);
  }

  has(name: string): boolean {
    return this.used.has(name);
  }

  claim(preferred: string): string {
    let name = preferred;
    for (let n = 2; this.used.has(name); n++) name = `${preferred}${n}`;
    this.used.add(name);
    return name;
  }
}
