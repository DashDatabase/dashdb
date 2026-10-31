'use client';

import { Button } from '@dashdb/ui';
import { AlertTriangleIcon, CopyIcon, DownloadIcon, RotateCwIcon } from 'lucide-react';
import Link from 'next/link';
import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { downloadText } from '@/lib/download';
import { fileSlug } from '../formats';
import { PROJECT_FILE_EXTENSION, serializeProjectFile } from '../project-file';
import { getProject, listBaselines } from '../projects';
import { editorStore } from '../store';

/**
 * The project as a `.dashdb.json` file: from memory when the editor still holds it (it may
 * have unsaved edits), else from this browser's storage.
 */
export async function recoverProjectFile(
  projectId: string | null,
): Promise<{ name: string; contents: string } | null> {
  const { doc, baselines, projectId: loaded } = editorStore.getState();
  if (doc && (projectId === null || loaded === projectId)) {
    return { name: doc.name, contents: serializeProjectFile(doc, baselines) };
  }
  if (!projectId) return null;
  const [stored, storedBaselines] = await Promise.all([
    getProject(projectId),
    listBaselines(projectId),
  ]);
  return stored
    ? { name: stored.name, contents: serializeProjectFile(stored, storedBaselines) }
    : null;
}

/** What users see when the editor crashes: their work first, then a way back. */
export function ErrorFallback({
  error,
  projectId,
  onRetry,
}: {
  error: unknown;
  projectId: string | null;
  onRetry: () => void;
}) {
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  const details = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

  const download = () => {
    recoverProjectFile(projectId).then(
      (file) => {
        if (!file) {
          setStatus('failed');
          return;
        }
        downloadText(
          `${fileSlug(file.name)}${PROJECT_FILE_EXTENSION}`,
          file.contents,
          'application/json',
        );
        setStatus('saved');
      },
      () => {
        setStatus('failed');
      },
    );
  };

  return (
    <main
      role="alert"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center"
      data-testid="error-fallback"
    >
      <AlertTriangleIcon className="size-8 text-danger-text" aria-hidden />
      <h1 className="text-xl font-semibold">Something went wrong in the editor</h1>
      <p className="max-w-md text-text-muted">
        Your project is saved in this browser. To be safe, download a copy now: you can import it on
        the projects page at any time.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={download}>
          <DownloadIcon aria-hidden /> Export your project
        </Button>
        <Button variant="outline" onClick={onRetry}>
          <RotateCwIcon aria-hidden /> Try again
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/app">Back to projects</Link>
        </Button>
      </div>
      <p aria-live="polite" className="text-sm">
        {status === 'saved' && 'Project file downloaded.'}
        {status === 'failed' && 'The project could not be read. Try reloading the page.'}
      </p>
      <details className="max-w-xl text-left text-xs text-text-muted">
        <summary className="cursor-pointer">Error details</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-highlight p-2 whitespace-pre-wrap">
          {details}
        </pre>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            void navigator.clipboard.writeText(details);
          }}
        >
          <CopyIcon aria-hidden /> Copy details
        </Button>
      </details>
    </main>
  );
}

/**
 * Development builds only: `?crash` in the URL makes the editor throw while rendering, so the
 * fallback can be tested end to end. Production builds compile this to nothing.
 */
export function DevCrashTrigger(): null {
  if (
    process.env.NODE_ENV !== 'production' &&
    new URLSearchParams(window.location.search).has('crash')
  ) {
    throw new Error('Crash requested with ?crash (development only)');
  }
  return null;
}

interface BoundaryProps {
  readonly projectId: string | null;
  readonly children: ReactNode;
}

/** Catches render errors in the editor and shows `ErrorFallback` instead of a blank page. */
export class EditorErrorBoundary extends Component<BoundaryProps, { error: unknown }> {
  override state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Editor crashed', error, info.componentStack);
  }

  override render() {
    if (this.state.error !== null) {
      return (
        <ErrorFallback
          error={this.state.error}
          projectId={this.props.projectId}
          onRetry={() => {
            this.setState({ error: null });
          }}
        />
      );
    }
    return this.props.children;
  }
}
