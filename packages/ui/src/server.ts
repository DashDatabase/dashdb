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
// Plain SVG, no hooks: server components (e.g. the marketing site) render it without
// pulling the client component bundle into the page.
export { Logo, LogoMark } from './brand/logo';
