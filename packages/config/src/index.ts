/** Brand palette, mirrored in tailwind/preset.css as `--color-brand-*`. */
export const brandColors = {
  50: '#eef6ff',
  100: '#d9eaff',
  500: '#2f7cf6',
  600: '#1f63db',
  700: '#1a4fb0',
  900: '#142f63',
} as const;

export type BrandShade = keyof typeof brandColors;
