/*
 * Users copy the introspection result out of whatever client they ran it in, and clients add
 * their own wrapping: psql's aligned output adds a `result` header, a dashed rule and a
 * `(1 row)` footer; DBeaver and pgAdmin copy a cell as a CSV field (quotes doubled) or as a
 * JSON string. This recovers the JSON document so the parser sees only that.
 */

/**
 * The JSON document inside a pasted introspection result. Text that holds no `{ … }` is
 * returned trimmed, so the parser can report it.
 */
export function normalizeIntrospectionPaste(text: string): string {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end < start) return trimmed;
  const body = trimmed.slice(start, end + 1);

  // A JSON string literal: "{\"tables\": …}".
  if (body.startsWith('{\\"')) {
    try {
      const decoded: unknown = JSON.parse(`"${body}"`);
      if (typeof decoded === 'string') return decoded;
    } catch {
      // Not a well-formed string literal; let the parser report the original.
    }
  }
  // A CSV/TSV field doubles every quote: {""tables"": …}.
  if (body.startsWith('{""')) return body.replaceAll('""', '"');
  return body;
}
