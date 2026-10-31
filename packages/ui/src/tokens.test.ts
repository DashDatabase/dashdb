import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guards the design-system rule: colors come from tokens, never literals or Tailwind's palette.
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const scanned = ['packages/ui/src', 'apps/web/src'];
const allowed = new Set([
  'packages/ui/src/styles/globals.css', // the token definitions themselves
  'packages/ui/src/tokens.test.ts', // the patterns below
  'apps/web/src/app/icon.svg', // generated from the tokens by apps/web/scripts/generate-icons.mjs
  'apps/web/src/lib/brand-colors.ts', // token values for OG images (Satori can't read CSS variables)
]);

const literal = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i;
const palette =
  /\b(?:bg|text|border|ring|fill|stroke|outline|from|via|to|shadow|divide|decoration|caret|placeholder)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/;

/* eslint-disable security/detect-non-literal-fs-filename -- walks fixed source dirs in this repo */
function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(tsx?|css|svg)$/.test(name)) yield path;
  }
}

describe('design tokens', () => {
  it('has no hard-coded colors outside the token file', () => {
    const offenders: string[] = [];
    for (const dir of scanned) {
      for (const path of sourceFiles(join(repoRoot, dir))) {
        const rel = relative(repoRoot, path).replaceAll('\\', '/');
        if (allowed.has(rel)) continue;
        readFileSync(path, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (literal.test(line) || palette.test(line)) {
              offenders.push(`${rel}:${String(i + 1)}: ${line.trim()}`);
            }
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
/* eslint-enable security/detect-non-literal-fs-filename */
