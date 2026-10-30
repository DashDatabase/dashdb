import { MAX_INPUT_BYTES, type Diagnostic, type SourceLocation } from './types';

export const START: SourceLocation = { line: 1, column: 1 };

/** Build an `offset → {line, column}` converter for `source`. */
export function createLocator(source: string): (offset: number) => SourceLocation {
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') lineStarts.push(i + 1);
  }
  return (offset) => {
    const clamped = Math.max(0, Math.min(offset, source.length));
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= clamped) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: clamped - (lineStarts[lo] ?? 0) + 1 };
  };
}

/** UTF-8 byte length without allocating an encoded copy. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      // A surrogate pair encodes one 4-byte code point.
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/** Returns an `input-too-large` diagnostic when `source` exceeds the 2 MB limit. */
export function checkInputSize(source: string): Diagnostic | null {
  // Every UTF-16 unit encodes to at most 3 bytes, so short inputs skip the count.
  if (source.length * 3 <= MAX_INPUT_BYTES) return null;
  const bytes = utf8ByteLength(source);
  if (bytes <= MAX_INPUT_BYTES) return null;
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return {
    severity: 'error',
    code: 'input-too-large',
    message: `Input is ${mb} MB; the limit is 2 MB. Split the schema into smaller files.`,
    ...START,
  };
}

/**
 * Use LF line endings throughout, so a CRLF checkout parses exactly like an LF one. Line and
 * column numbers are unaffected.
 */
export function normalizeNewlines(source: string): string {
  return source.includes('\r') ? source.replace(/\r\n?/g, '\n') : source;
}

/** First line of an error message, without library-specific parse tables. */
export function firstLine(message: string): string {
  return message.split('\n', 1)[0]?.trim() ?? '';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  // Array.prototype.sort is stable, so same-position diagnostics keep emission order.
  return [...diagnostics].sort((a, b) => a.line - b.line || a.column - b.column);
}
