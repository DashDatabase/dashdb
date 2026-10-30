// Server-safe entry (no 'use client'): values that server components and build scripts read directly.
export {
  THEME_STORAGE_KEY,
  defaultPreference,
  resolveTheme,
  themeScript,
  type ResolvedTheme,
  type ThemePreference,
} from './theme/theme';
export { MARK_SIZE, markGeometry, renderMarkSvg, type MarkColors } from './brand/logo-geometry';
