import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { brandColors } from './index';

// eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed path next to this file
const preset = readFileSync(
  fileURLToPath(new URL('../tailwind/preset.css', import.meta.url)),
  'utf8',
);

describe('tailwind preset', () => {
  it('defines every brand color from brandColors', () => {
    for (const [shade, hex] of Object.entries(brandColors)) {
      expect(preset).toContain(`--color-brand-${shade}: ${hex};`);
    }
  });
});
