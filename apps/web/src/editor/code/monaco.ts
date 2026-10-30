// Lazy Monaco setup: nothing here is imported until the Code panel first opens.
import type * as Monaco from 'monaco-editor/editor/editor.api';
import { dbmlConfiguration, dbmlLanguage, prismaConfiguration, prismaLanguage } from './languages';

export type MonacoApi = typeof Monaco;

let loading: Promise<MonacoApi> | null = null;

/** Loads the editor core, the languages the panel uses and the editor worker, once. */
export function loadMonaco(): Promise<MonacoApi> {
  loading ??= (async () => {
    // Monaco's own worker computes diffs and links; the languages here are tokenizer-only.
    self.MonacoEnvironment = {
      getWorker: () =>
        new Worker(new URL('./monaco.worker.ts', import.meta.url), { type: 'module' }),
    };
    const monaco = await import('monaco-editor/editor/editor.api');
    await Promise.all([
      import('monaco-editor/languages/definitions/pgsql/register'),
      import('monaco-editor/languages/definitions/mysql/register'),
      import('monaco-editor/languages/definitions/typescript/register'),
    ]);
    registerLanguage(monaco, 'prisma', prismaLanguage, prismaConfiguration);
    registerLanguage(monaco, 'dbml', dbmlLanguage, dbmlConfiguration);
    return monaco;
  })();
  loading.catch(() => {
    // Let the next attempt retry (e.g. a chunk that failed to download).
    loading = null;
  });
  return loading;
}

function registerLanguage(
  monaco: MonacoApi,
  id: string,
  language: Monaco.languages.IMonarchLanguage,
  configuration: Monaco.languages.LanguageConfiguration,
): void {
  if (monaco.languages.getLanguages().some((l) => l.id === id)) return;
  monaco.languages.register({ id });
  monaco.languages.setMonarchTokensProvider(id, language);
  monaco.languages.setLanguageConfiguration(id, configuration);
}

/** A CSS color (token value) as `#rrggbb`, which is all Monaco themes accept. */
function hex(value: string, fallback: string): string {
  const context = document.createElement('canvas').getContext('2d');
  if (!context || !value) return fallback;
  context.fillStyle = fallback;
  context.fillStyle = value;
  const result = context.fillStyle;
  return result.startsWith('#') ? result : fallback;
}

/** Defines (or redefines) the `dashdb` theme from the current design tokens and applies it. */
export function applyTheme(monaco: MonacoApi, dark: boolean): void {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) =>
    hex(styles.getPropertyValue(`--${name}`).trim(), fallback);
  const text = token('text', dark ? '#e5e7eb' : '#111827');
  const muted = token('text-muted', '#6b7280');
  const surface = token('surface', dark ? '#111827' : '#f9fafb');
  const highlight = token('highlight', dark ? '#1f2937' : '#f3f4f6');
  const primary = token('primary-text', dark ? '#a5b4fc' : '#4338ca');
  const accent = token('accent-text', dark ? '#5eead4' : '#115e59');
  const success = token('success-text', dark ? '#86efac' : '#166534');
  const warning = token('warning-text', dark ? '#fcd34d' : '#92400e');
  const danger = token('danger-text', dark ? '#fca5a5' : '#b91c1c');
  const strip = (color: string) => color.slice(1);

  monaco.editor.defineTheme('dashdb', {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: strip(muted), fontStyle: 'italic' },
      { token: 'keyword', foreground: strip(primary), fontStyle: 'bold' },
      { token: 'type', foreground: strip(accent) },
      { token: 'type.identifier', foreground: strip(accent) },
      { token: 'annotation', foreground: strip(warning) },
      { token: 'attribute.name', foreground: strip(warning) },
      { token: 'string', foreground: strip(success) },
      { token: 'identifier.quoted', foreground: strip(text) },
      { token: 'number', foreground: strip(danger) },
      { token: 'constant', foreground: strip(danger) },
      { token: 'operator', foreground: strip(primary) },
    ],
    colors: {
      'editor.background': surface,
      'editor.foreground': text,
      'editor.lineHighlightBackground': highlight,
      'editorLineNumber.foreground': muted,
      'editorGutter.background': surface,
    },
  });
  monaco.editor.setTheme('dashdb');
}
