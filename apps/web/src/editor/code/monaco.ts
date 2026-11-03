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

/**
 * A CSS color (token value) as `#rrggbb`, which is all Monaco themes accept, or undefined when it
 * can't be resolved (or has alpha), so the base theme's color applies instead.
 */
function hex(value: string): string | undefined {
  const context = document.createElement('canvas').getContext('2d');
  if (!context || !value) return undefined;
  // An invalid value leaves fillStyle unchanged, and transparent never serializes with a #.
  context.fillStyle = 'transparent';
  context.fillStyle = value;
  const result = context.fillStyle;
  return result.startsWith('#') ? result : undefined;
}

/** Defines (or redefines) the `dashdb` theme from the current design tokens and applies it. */
export function applyTheme(monaco: MonacoApi, dark: boolean): void {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => hex(styles.getPropertyValue(`--${name}`).trim());
  const text = token('text');
  const muted = token('text-muted');
  const surface = token('surface');
  const highlight = token('highlight');
  const primary = token('primary-text');
  const accent = token('accent-text');
  const success = token('success-text');
  const warning = token('warning-text');
  const danger = token('danger-text');
  const rule = (name: string, color: string | undefined, fontStyle?: string) =>
    color ? [{ token: name, foreground: color.slice(1), ...(fontStyle && { fontStyle }) }] : [];
  const colors: Record<string, string | undefined> = {
    'editor.background': surface,
    'editor.foreground': text,
    'editor.lineHighlightBackground': highlight,
    'editorLineNumber.foreground': muted,
    'editorGutter.background': surface,
  };

  monaco.editor.defineTheme('dashdb', {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      ...rule('comment', muted, 'italic'),
      ...rule('keyword', primary, 'bold'),
      ...rule('type', accent),
      ...rule('type.identifier', accent),
      ...rule('annotation', warning),
      ...rule('attribute.name', warning),
      ...rule('string', success),
      ...rule('identifier.quoted', text),
      ...rule('number', danger),
      ...rule('constant', danger),
      ...rule('operator', primary),
    ],
    colors: Object.fromEntries(
      Object.entries(colors).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
  });
  monaco.editor.setTheme('dashdb');
}
