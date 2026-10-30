/** `12`, `-3.5`: a plain decimal number as SQL catalogs and Prisma print them. */
export function isNumericLiteral(text: string): boolean {
  return /^-?[\d.]+$/.test(text) && !text.endsWith('.') && Number.isFinite(Number(text));
}

/**
 * Read a single-quoted SQL string at the start of `text` (`''` escapes a quote). Returns the
 * unescaped value and whatever follows the closing quote, or `null` if `text` is not one.
 */
export function readQuoted(text: string): { value: string; rest: string } | null {
  if (!text.startsWith("'")) return null;
  let value = '';
  for (let i = 1; i < text.length; i++) {
    const ch = text[i] as string;
    if (ch !== "'") value += ch;
    else if (text[i + 1] === "'") {
      value += "'";
      i++;
    } else return { value, rest: text.slice(i + 1) };
  }
  return null;
}
