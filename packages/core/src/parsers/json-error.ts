/**
 * Offset of the first character that makes `text` invalid JSON (or `text.length` when the input
 * ends early). Only called after `JSON.parse` has failed, to place the diagnostic precisely.
 */
export function jsonErrorOffset(text: string): number {
  let i = 0;

  class Invalid extends Error {}
  const fail = (): never => {
    throw new Invalid();
  };
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i] as string)) i++;
  };
  const literal = (word: string) => {
    for (const ch of word) {
      if (text[i] !== ch) fail();
      i++;
    }
  };
  const string = () => {
    i++; // opening quote
    while (i < text.length) {
      const ch = text[i] as string;
      if (ch === '"') {
        i++;
        return;
      }
      if (ch === '\\') {
        const esc = text[i + 1];
        if (esc === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
            i += 2;
            fail();
          }
          i += 6;
        } else if (esc !== undefined && '"\\/bfnrt'.includes(esc)) i += 2;
        else {
          i++;
          fail();
        }
      } else if (ch < ' ') fail();
      else i++;
    }
    fail();
  };
  const digits = () => {
    const start = i;
    while (i < text.length && (text[i] as string) >= '0' && (text[i] as string) <= '9') i++;
    if (i === start) fail();
  };
  const number = () => {
    if (text[i] === '-') i++;
    if (text[i] === '0') i++;
    else digits();
    if (text[i] === '.') {
      i++;
      digits();
    }
    if (text[i] === 'e' || text[i] === 'E') {
      i++;
      if (text[i] === '+' || text[i] === '-') i++;
      digits();
    }
  };
  const value = (): void => {
    ws();
    const ch = text[i];
    if (ch === '{') {
      i++;
      ws();
      if (text[i] === '}') {
        i++;
        return;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') fail();
        string();
        ws();
        if (text[i] !== ':') fail();
        i++;
        value();
        ws();
        if (text[i] === ',') i++;
        else if (text[i] === '}') {
          i++;
          return;
        } else fail();
      }
    }
    if (ch === '[') {
      i++;
      ws();
      if (text[i] === ']') {
        i++;
        return;
      }
      for (;;) {
        value();
        ws();
        if (text[i] === ',') i++;
        else if (text[i] === ']') {
          i++;
          return;
        } else fail();
      }
    }
    if (ch === '"') string();
    else if (ch === 't') literal('true');
    else if (ch === 'f') literal('false');
    else if (ch === 'n') literal('null');
    else if (ch === '-' || (ch !== undefined && ch >= '0' && ch <= '9')) number();
    else fail();
  };

  try {
    value();
    ws();
    if (i < text.length) fail();
  } catch (error) {
    if (!(error instanceof Invalid)) throw error;
  }
  return Math.min(i, text.length);
}
