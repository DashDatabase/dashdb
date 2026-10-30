import { describe, expect, it } from 'vitest';
import { defaultPreference, resolveTheme, THEME_STORAGE_KEY, themeScript } from './theme';

interface Env {
  stored?: string | null;
  pathname?: string;
  prefersDark?: boolean;
  storageThrows?: boolean;
}

/** Runs the inline boot script against a fake browser and returns the <html> state it produced. */
function runScript({ stored = null, pathname = '/', prefersDark = false, storageThrows }: Env) {
  const classes = new Set<string>();
  const documentElement = {
    classList: {
      toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
    },
    style: { colorScheme: '' },
  };
  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error('blocked');
      return key === THEME_STORAGE_KEY ? stored : null;
    },
  };
  const matchMedia = (query: string) => ({ matches: query.includes('dark') && prefersDark });
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- executes the exact string we ship
  const run = new Function('localStorage', 'location', 'matchMedia', 'document', themeScript) as (
    ...globals: unknown[]
  ) => void;
  run(localStorage, { pathname }, matchMedia, { documentElement });
  return { dark: classes.has('dark'), colorScheme: documentElement.style.colorScheme };
}

describe('defaultPreference', () => {
  it('defaults /app and its children to dark', () => {
    expect(defaultPreference('/app')).toBe('dark');
    expect(defaultPreference('/app/projects/1')).toBe('dark');
  });

  it('follows the OS elsewhere', () => {
    expect(defaultPreference('/')).toBe('system');
    expect(defaultPreference('/design')).toBe('system');
    expect(defaultPreference('/apples')).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('resolves system from the media query and passes explicit choices through', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('themeScript', () => {
  it('applies a stored preference over the route default', () => {
    expect(runScript({ stored: 'light', pathname: '/app' })).toEqual({
      dark: false,
      colorScheme: 'light',
    });
    expect(runScript({ stored: 'dark', pathname: '/' })).toEqual({
      dark: true,
      colorScheme: 'dark',
    });
  });

  it('defaults to dark on /app with nothing stored', () => {
    expect(runScript({ pathname: '/app/settings' }).dark).toBe(true);
    expect(runScript({ pathname: '/apples' }).dark).toBe(false);
  });

  it('follows the OS outside /app with nothing stored', () => {
    expect(runScript({ prefersDark: true }).dark).toBe(true);
    expect(runScript({ prefersDark: false }).dark).toBe(false);
  });

  it('ignores junk values and blocked storage', () => {
    expect(runScript({ stored: 'purple', pathname: '/app' }).dark).toBe(true);
    expect(runScript({ storageThrows: true, prefersDark: true }).dark).toBe(true);
  });
});
