import { describe, expect, it } from 'vitest';
import {
  checkInputSize,
  createLocator,
  firstLine,
  normalizeNewlines,
  sortDiagnostics,
  utf8ByteLength,
} from './diagnostics';
import { MAX_INPUT_BYTES, type Diagnostic } from './types';

describe('createLocator', () => {
  it('maps offsets to 1-based lines and columns', () => {
    const at = createLocator('ab\ncde\n\nf');
    expect(at(0)).toEqual({ line: 1, column: 1 });
    expect(at(2)).toEqual({ line: 1, column: 3 });
    expect(at(3)).toEqual({ line: 2, column: 1 });
    expect(at(5)).toEqual({ line: 2, column: 3 });
    expect(at(7)).toEqual({ line: 3, column: 1 });
    expect(at(8)).toEqual({ line: 4, column: 1 });
  });

  it('clamps out-of-range offsets', () => {
    const at = createLocator('ab\ncd');
    expect(at(-5)).toEqual({ line: 1, column: 1 });
    expect(at(99)).toEqual({ line: 2, column: 3 });
  });
});

describe('utf8ByteLength', () => {
  it('counts 1-, 2-, 3- and 4-byte characters', () => {
    expect(utf8ByteLength('a')).toBe(1);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('€')).toBe(3);
    expect(utf8ByteLength('😀')).toBe(4);
    expect(utf8ByteLength('a€😀')).toBe(new TextEncoder().encode('a€😀').byteLength);
  });
});

describe('checkInputSize', () => {
  it('accepts inputs up to 2 MB', () => {
    expect(checkInputSize('x'.repeat(MAX_INPUT_BYTES))).toBeNull();
  });

  it('rejects inputs over 2 MB with a clear diagnostic', () => {
    expect(checkInputSize('x'.repeat(MAX_INPUT_BYTES + 1))).toEqual({
      severity: 'error',
      code: 'input-too-large',
      message: 'Input is 2.0 MB; the limit is 2 MB. Split the schema into smaller files.',
      line: 1,
      column: 1,
    });
  });

  it('measures bytes, not characters', () => {
    // 1M two-byte characters is ~2 MB of UTF-8 but only 1M UTF-16 units.
    expect(checkInputSize('é'.repeat(MAX_INPUT_BYTES / 2))).toBeNull();
    expect(checkInputSize('é'.repeat(MAX_INPUT_BYTES / 2 + 1))?.code).toBe('input-too-large');
  });
});

describe('helpers', () => {
  it('normalizes CRLF and lone CR line endings', () => {
    expect(normalizeNewlines('a\r\nb\rc\n')).toBe('a\nb\nc\n');
    const lf = 'no carriage returns';
    expect(normalizeNewlines(lf)).toBe(lf);
  });

  it('keeps only the first line of a message', () => {
    expect(firstLine('  Syntax error  \n\n  table…')).toBe('Syntax error');
  });

  it('sorts diagnostics by position, keeping ties in order', () => {
    const d = (line: number, column: number, message: string): Diagnostic => ({
      severity: 'warning',
      code: 'unsupported-statement',
      message,
      line,
      column,
    });
    expect(
      sortDiagnostics([d(2, 1, 'c'), d(1, 5, 'b'), d(1, 1, 'a'), d(1, 5, 'b2')]).map(
        (x) => x.message,
      ),
    ).toEqual(['a', 'b', 'b2', 'c']);
  });
});
