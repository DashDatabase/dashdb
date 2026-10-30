'use client';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
  useTheme,
} from '@dashdb/ui';
import { CopyIcon, DownloadIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { downloadText } from '@/lib/download';
import { fileSlug } from '../formats';
import { editorStore, useEditor } from '../store';
import { CODE_FORMATS, isCodeFormat, resolveCodeFormat } from './code-formats';
import type { CodeController, CodeStatus } from './code-controller';

type PanelStatus = CodeStatus | { readonly kind: 'loading' } | { readonly kind: 'load-failed' };

function statusText(status: PanelStatus, readOnlyReason: string | null): string {
  switch (status.kind) {
    case 'loading':
      return 'Loading editor…';
    case 'load-failed':
      return 'The code editor could not be loaded.';
    case 'generate-failed':
      return 'Could not generate code for this schema.';
    case 'editing':
      return 'Editing… changes apply when you pause or press ⌘S / Ctrl+S.';
    case 'parsing':
      return 'Applying…';
    case 'invalid':
      return `${String(status.errors)} ${status.errors === 1 ? 'error' : 'errors'}; the canvas was not changed.`;
    case 'synced':
      return readOnlyReason ?? 'In sync with the canvas.';
  }
}

export function CodePanel() {
  const schema = useEditor((s) => s.doc?.schema ?? null);
  const projectName = useEditor((s) => s.doc?.name ?? 'schema');
  const format = useEditor((s) => s.codeFormat);
  const setCodeFormat = useEditor((s) => s.setCodeFormat);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  const containerRef = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<CodeController | null>(null);
  const [status, setStatus] = useState<PanelStatus>({ kind: 'loading' });
  const [loadAttempt, setLoadAttempt] = useState(0);

  const dialect = schema?.dialect ?? 'postgres';
  const resolved = resolveCodeFormat(format, dialect);

  // Monaco (and the controller) load on first open, so the editor never weighs on the canvas.
  useEffect(() => {
    let created: CodeController | null = null;
    let disposed = false;
    Promise.all([import('./monaco'), import('./code-controller')])
      .then(async ([{ loadMonaco }, { CodeController }]) => {
        const monaco = await loadMonaco();
        const container = containerRef.current;
        if (disposed || !container) return;
        created = new CodeController(monaco, container, {
          onStatus: setStatus,
          getSchema: () => editorStore.getState().doc?.schema ?? null,
          commit: (next) => {
            const store = editorStore.getState();
            const applied = store.editSchema('Edit code', () => next, { group: 'code' });
            return applied ? (editorStore.getState().doc?.schema ?? null) : null;
          },
        });
        setController(created);
      })
      .catch(() => {
        if (!disposed) setStatus({ kind: 'load-failed' });
      });
    return () => {
      disposed = true;
      created?.dispose();
      setController(null);
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (controller && schema) controller.show(schema, format);
  }, [controller, schema, format]);

  useEffect(() => {
    if (!controller) return;
    void import('./monaco').then(({ applyTheme, loadMonaco }) =>
      loadMonaco().then((monaco) => {
        applyTheme(monaco, dark);
      }),
    );
  }, [controller, dark]);

  const copy = () => {
    if (!controller) return;
    navigator.clipboard.writeText(controller.getText()).then(
      () => toast.success('Copied to clipboard'),
      () => toast.error('Could not copy to the clipboard'),
    );
  };

  const download = () => {
    if (!controller) return;
    downloadText(`${fileSlug(projectName)}.${resolved.extension}`, controller.getText());
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="code-panel">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Select
          value={format}
          onValueChange={(value) => {
            if (isCodeFormat(value)) setCodeFormat(value);
          }}
        >
          <SelectTrigger size="sm" className="w-44" aria-label="Code format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CODE_FORMATS.map((id) => (
              <SelectItem key={id} value={id}>
                {resolveCodeFormat(id, dialect).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Copy code"
          title="Copy code"
          disabled={!controller}
          onClick={copy}
        >
          <CopyIcon aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Download code"
          title="Download code"
          disabled={!controller}
          onClick={download}
        >
          <DownloadIcon aria-hidden />
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" data-testid="code-editor" />
        {status.kind === 'load-failed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface p-6 text-center">
            <p className="text-sm text-text-muted">The code editor could not be loaded.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStatus({ kind: 'loading' });
                setLoadAttempt((n) => n + 1);
              }}
            >
              Retry
            </Button>
          </div>
        )}
      </div>
      <p
        className={`border-t px-3 py-1.5 text-xs ${status.kind === 'invalid' ? 'text-danger-text' : 'text-text-muted'}`}
        role="status"
        aria-live="polite"
        data-testid="code-status"
        data-state={status.kind}
      >
        {statusText(status, resolved.readOnlyReason)}
      </p>
    </div>
  );
}
