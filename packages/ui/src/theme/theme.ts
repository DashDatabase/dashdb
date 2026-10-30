// Framework-free theme logic, shared by the inline boot script and the React hook.

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'dashdb-theme';

/** Routes under /app default to dark; everything else follows the OS. */
export function defaultPreference(pathname: string): ThemePreference {
  return /^\/app(\/|$)/.test(pathname) ? 'dark' : 'system';
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

/**
 * Inline script for <head> that applies the stored theme before first paint (no flash).
 * It mirrors defaultPreference/resolveTheme and must stay dependency-free.
 */
export const themeScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var s=null;try{s=localStorage.getItem(k)}catch(_){}var p=s==='light'||s==='dark'||s==='system'?s:(/^[/]app([/]|$)/.test(location.pathname)?'dark':'system');var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light'}catch(_){}})()`;
