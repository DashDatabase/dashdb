'use client';

import type { ConvertFrom, ConvertResult, ConvertTo } from '@dashdb/core/lite';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as Monaco from 'monaco-editor/editor/editor.api';
import { downloadText } from '@/lib/download';

export interface ToolConverterProps {
  readonly from: ConvertFrom;
  readonly to: ConvertTo;
  readonly example: string;
  readonly inputLabel: string;
  readonly outputLabel: string;
  readonly inputLanguage: string;
  readonly outputLanguage: string;
  readonly outputExtension: string;
  /** Name for the project "Open in DashDB editor" creates. */
  readonly projectName: string;
  /** Also show the result as an ER diagram (prisma-to-erd). */
  readonly diagram?: boolean;
}

type Outcome =
  | { readonly state: 'converting' }
  | { readonly state: 'done'; readonly result: ConvertResult; readonly ms: number };

const DIALECT_NAMES: Record<string, string> = { postgres: 'PostgreSQL', mysql: 'MySQL' };
const TYPING_DELAY_MS = 300;

const isDark = () => document.documentElement.classList.contains('dark');

/** Problems worth showing: errors and warnings, not informational notes. */
function problems(result: ConvertResult): { level: 'error' | 'warning'; text: string }[] {
  const parse = result.diagnostics
    .filter((d) => d.severity !== 'info')
    .map((d) => ({
      level: d.severity === 'error' ? ('error' as const) : ('warning' as const),
      text: `Line ${String(d.line)}: ${d.message}`,
    }));
  const output = result.warnings.map((w) => ({
    level: 'warning' as const,
    text: w.element ? `${w.element}: ${w.message}` : w.message,
  }));
  return [...parse, ...output];
}

const BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-highlight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50';
const PANE = 'relative h-[26rem] overflow-hidden rounded-lg border bg-surface';

/**
 * Two code panes: paste a schema on the left, get the conversion on the right. Everything runs
 * in this browser tab through @dashdb/core; nothing is sent to a server. Monaco and the
 * converter load after the page has rendered, so the static text is all a first visit pays for.
 */
export function ToolConverter(props: ToolConverterProps) {
  const { from, to, example, diagram = false } = props;
  const router = useRouter();
  const inputHost = useRef<HTMLDivElement>(null);
  const outputHost = useRef<HTMLDivElement>(null);
  const editors = useRef<{
    input?: Monaco.editor.IStandaloneCodeEditor;
    output?: Monaco.editor.IStandaloneCodeEditor;
  }>({});
  const source = useRef(example);
  /** The newest output, for an output pane created after the conversion finished. */
  const output = useRef('');
  const latest = useRef(0);
  const [outcome, setOutcome] = useState<Outcome>({ state: 'converting' });
  const [monacoReady, setMonacoReady] = useState(false);
  const [view, setView] = useState<'diagram' | 'code'>(diagram ? 'diagram' : 'code');
  const [svg, setSvg] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [opening, setOpening] = useState(false);

  /** Converts the current source; results of superseded runs are dropped. */
  const run = useCallback(async () => {
    const id = ++latest.current;
    const { convert } = await import('@dashdb/core/convert');
    const started = performance.now();
    const result = await convert({ from, to, source: source.current });
    // A newer conversion started while this one ran: drop this result.
    if (id !== latest.current) return;
    setOutcome({ state: 'done', result, ms: Math.round(performance.now() - started) });
    output.current = result.code;
    editors.current.output?.setValue(result.code);
  }, [from, to]);

  /** For edits after the first conversion: show progress, then convert. */
  const rerun = useCallback(() => {
    setOutcome({ state: 'converting' });
    void run();
  }, [run]);

  // First conversion of the example, then Monaco for both panes.
  useEffect(() => {
    void run();
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      void import('@/editor/code/monaco').then(({ applyTheme, loadMonaco }) =>
        loadMonaco().then((monaco) => {
          applyTheme(monaco, isDark());
        }),
      );
    });
    void import('@/editor/code/monaco').then(async ({ applyTheme, loadMonaco }) => {
      const monaco = await loadMonaco();
      if (disposed || !inputHost.current || !outputHost.current) return;
      applyTheme(monaco, isDark());
      const shared: Monaco.editor.IStandaloneEditorConstructionOptions = {
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
        tabSize: 2,
        theme: 'dashdb',
      };
      const input = monaco.editor.create(inputHost.current, {
        ...shared,
        value: source.current,
        language: props.inputLanguage,
        ariaLabel: `${props.inputLabel} input`,
      });
      const outputEditor = monaco.editor.create(outputHost.current, {
        ...shared,
        value: output.current,
        language: props.outputLanguage,
        readOnly: true,
        ariaLabel: `${props.outputLabel} output`,
      });
      editors.current = { input, output: outputEditor };
      input.onDidChangeModelContent(() => {
        source.current = input.getValue();
        clearTimeout(timer);
        timer = setTimeout(rerun, TYPING_DELAY_MS);
      });
      // Pasting is the common case: convert straight away.
      input.onDidPaste(() => {
        clearTimeout(timer);
        source.current = input.getValue();
        rerun();
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      setMonacoReady(true);
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      observer.disconnect();
      editors.current.input?.dispose();
      editors.current.output?.dispose();
      editors.current = {};
    };
    // Mount once: props describe a fixed tool, and run() reads the latest source from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The ER diagram, redrawn for each new result.
  const result = outcome.state === 'done' ? outcome.result : null;
  useEffect(() => {
    if (!diagram || !result?.ok) return;
    let cancelled = false;
    void import('@/tools/diagram')
      .then(({ schemaDiagramSvg }) => schemaDiagramSvg(result.schema, isDark() ? 'dark' : 'light'))
      .then((drawn) => {
        if (!cancelled) setSvg(drawn);
      });
    return () => {
      cancelled = true;
    };
  }, [diagram, result]);

  const code = result?.ok ? result.code : '';
  const found = result ? problems(result) : [];
  const detected = result && from === 'sql' ? DIALECT_NAMES[result.from] : undefined;

  const copy = () => {
    navigator.clipboard.writeText(code).then(
      () => {
        setNotice(`${props.outputLabel} copied to the clipboard.`);
      },
      () => {
        setNotice('Could not copy to the clipboard.');
      },
    );
  };

  const download = () => {
    if (view === 'diagram' && svg) {
      downloadText(`schema-diagram.svg`, svg, 'image/svg+xml');
      return;
    }
    downloadText(`schema.${props.outputExtension}`, code);
  };

  const openInEditor = async () => {
    if (!result?.ok) return;
    setOpening(true);
    try {
      const [{ createProject }, { markForArrange }, { track }] = await Promise.all([
        import('@/editor/projects'),
        import('@/editor/canvas/arrange-intent'),
        import('@/lib/telemetry'),
      ]);
      const project = await createProject({ name: props.projectName, schema: result.schema });
      track('project_created', { source: 'tool', dialect: project.schema.dialect });
      markForArrange(project.id);
      router.push(`/app/p/${project.id}`);
    } catch {
      setOpening(false);
      setNotice('Could not create the project in this browser.');
    }
  };

  const status =
    outcome.state === 'converting'
      ? 'Converting…'
      : outcome.result.ok
        ? `Converted in ${String(outcome.ms)} ms, in your browser${detected ? ` · detected ${detected}` : ''}`
        : 'Fix the errors below to see the result.';

  return (
    <div className="space-y-3" data-testid="tool-converter" data-state={outcome.state}>
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label={`${props.inputLabel} input`} className="min-w-0">
          <div className="mb-2 flex h-9 items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{props.inputLabel}</h2>
            <button
              type="button"
              className={BUTTON}
              onClick={() => {
                source.current = example;
                editors.current.input?.setValue(example);
                rerun();
              }}
            >
              Reset example
            </button>
          </div>
          <div className={PANE}>
            <div ref={inputHost} className="absolute inset-0" data-testid="tool-input" />
            {!monacoReady && (
              <pre className="absolute inset-0 overflow-auto p-4 font-mono text-[13px] leading-5">
                {example}
              </pre>
            )}
          </div>
        </section>

        <section aria-label={`${props.outputLabel} output`} className="min-w-0">
          <div className="mb-2 flex h-9 items-center justify-between gap-2">
            {diagram ? (
              <div role="tablist" aria-label="Output view" className="flex gap-1">
                {(['diagram', 'code'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={view === tab}
                    className={`${BUTTON} ${view === tab ? 'bg-highlight' : 'border-transparent'}`}
                    onClick={() => {
                      setView(tab);
                    }}
                  >
                    {tab === 'diagram' ? 'Diagram' : props.outputLabel}
                  </button>
                ))}
              </div>
            ) : (
              <h2 className="text-sm font-semibold">{props.outputLabel}</h2>
            )}
            <div className="flex gap-2">
              <button type="button" className={BUTTON} onClick={copy} disabled={!code}>
                Copy
              </button>
              <button
                type="button"
                className={BUTTON}
                onClick={download}
                disabled={view === 'diagram' ? !svg : !code}
              >
                {view === 'diagram' ? 'Download SVG' : 'Download'}
              </button>
            </div>
          </div>
          <div className={PANE}>
            <div
              ref={outputHost}
              className={`absolute inset-0 ${view === 'diagram' ? 'invisible' : ''}`}
              data-testid="tool-output"
            />
            {!monacoReady && view === 'code' && (
              <pre className="absolute inset-0 overflow-auto p-4 font-mono text-[13px] leading-5">
                {code}
              </pre>
            )}
            {view === 'diagram' && (
              <div
                className="absolute inset-0 overflow-auto bg-background p-2"
                data-testid="tool-diagram"
              >
                {svg ? (
                  // Our own SVG (escaped text, no scripts), shown as an image so it cannot run code.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
                    alt="Entity relationship diagram of the schema"
                    className="mx-auto h-auto max-w-full"
                  />
                ) : (
                  <p className="p-4 text-sm text-text-muted">Drawing the diagram…</p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted" role="status" data-testid="tool-status">
          {status}
        </p>
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
          onClick={() => void openInEditor()}
          disabled={!result?.ok || opening}
        >
          {opening ? 'Opening…' : 'Open in DashDB editor'}
        </button>
      </div>

      {found.length > 0 && (
        <ul
          className="space-y-1 rounded-lg border p-3 text-sm"
          aria-label="Conversion notes"
          data-testid="tool-problems"
        >
          {found.map((p, i) => (
            <li key={i} className={p.level === 'error' ? 'text-danger-text' : 'text-warning-text'}>
              <span className="font-medium">{p.level === 'error' ? 'Error' : 'Note'}:</span>{' '}
              {p.text}
            </li>
          ))}
        </ul>
      )}
      <p className="min-h-5 text-sm text-text-muted" aria-live="polite">
        {notice}
      </p>
    </div>
  );
}
