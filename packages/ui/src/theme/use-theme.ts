import { useCallback, useSyncExternalStore } from 'react';
import {
  THEME_STORAGE_KEY,
  defaultPreference,
  isThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Storage can be blocked (private mode, sandboxed iframes); fall back to the default.
  }
  return isThemePreference(stored) ? stored : defaultPreference(window.location.pathname);
}

function prefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

function notify(): void {
  applyTheme(resolveTheme(readPreference(), prefersDark()));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.matchMedia(DARK_QUERY).addEventListener('change', notify);
    window.addEventListener('storage', notify);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.matchMedia(DARK_QUERY).removeEventListener('change', notify);
      window.removeEventListener('storage', notify);
    }
  };
}

const getServerSnapshot = () => null;

/** Stores the preference, applies it to <html> and updates every useTheme() consumer. */
export function setTheme(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not persisted, but still applied for this page view.
  }
  notify();
}

export interface UseThemeResult {
  /** The user's choice; null during SSR and hydration. */
  theme: ThemePreference | null;
  /** What is actually showing; null during SSR and hydration. */
  resolvedTheme: ResolvedTheme | null;
  setTheme: (preference: ThemePreference) => void;
}

export function useTheme(): UseThemeResult {
  const theme = useSyncExternalStore(subscribe, readPreference, getServerSnapshot);
  const dark = useSyncExternalStore(subscribe, prefersDark, getServerSnapshot);
  const set = useCallback((preference: ThemePreference) => {
    setTheme(preference);
  }, []);
  return {
    theme,
    resolvedTheme: theme === null || dark === null ? null : resolveTheme(theme, dark),
    setTheme: set,
  };
}
