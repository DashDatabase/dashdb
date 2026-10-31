// Brand colors as literal values, for renderers that can't read CSS variables (Satori, which
// draws the OG images). They mirror tokens in @dashdb/ui's globals.css; keep the two in sync.
// The design-token test allows literals in this file only for that reason.

export const BRAND = {
  /** --gray-950 */
  ink: '#0a0a0d',
  /** Deep indigo for the OG background gradient. */
  inkIndigo: '#16163a',
  /** --gray-400 */
  muted: '#9b9ba7',
  /** --white */
  white: '#ffffff',
  /** --indigo-600, the mark's tile. */
  indigo: '#4f46e5',
  /** --indigo-300, the mark's rows. */
  indigoLight: '#a5b4fc',
  /** --teal-300, the mark's node. */
  teal: '#5eead4',
} as const;
