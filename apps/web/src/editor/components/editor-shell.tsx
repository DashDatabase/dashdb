'use client';

import { Button, ResizableHandle, ResizablePanel, ResizablePanelGroup, Skeleton } from '@dashdb/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useEditorShortcuts, useIsDesktop } from '../hooks';
import { getProject, saveProject, type Project } from '../projects';
import { editorStore, useEditor } from '../store';
import { CanvasPlaceholder } from './canvas-placeholder';
import { CommandPalette } from './command-palette';
import { ExportDialog } from './export-dialog';
import { ImportDialog } from './import-dialog';
import { ReadOnlyView } from './read-only-view';
import { RightPanel } from './right-panel';
import { Sidebar } from './sidebar';
import { ProblemsDialog, StatusBar } from './status-bar';
import { TopBar } from './top-bar';

const AUTOSAVE_DELAY_MS = 400;

/** Persists the open project to IndexedDB shortly after each change, and on unmount. */
function useAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Project | null = null;
    // Counts edits so a save that finishes after a newer edit doesn't report "saved".
    let edits = 0;

    const flush = async () => {
      timer = undefined;
      const project = pending;
      pending = null;
      if (!project) return;
      const version = edits;
      try {
        await saveProject(project);
        if (version === edits) editorStore.getState().setSaveState('saved');
      } catch {
        editorStore.getState().setSaveState('error');
      }
    };

    const unsubscribe = editorStore.subscribe((state, previous) => {
      // A fresh load is already persisted; only save edits to the same project.
      if (!state.project || state.project === previous.project) return;
      if (previous.project?.id !== state.project.id) return;
      pending = state.project;
      edits++;
      if (state.saveState !== 'saving') state.setSaveState('saving');
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
      void flush();
    };
  }, []);
}

function EditorLayout() {
  const leftOpen = useEditor((s) => s.leftOpen);
  const rightOpen = useEditor((s) => s.rightOpen);
  useEditorShortcuts();

  return (
    <div className="flex h-dvh flex-col bg-background" data-testid="editor">
      <TopBar />
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        {leftOpen && (
          <>
            <ResizablePanel id="panel-sidebar" defaultSize="18%" minSize="12%" maxSize="35%">
              <Sidebar />
            </ResizablePanel>
            <ResizableHandle />
          </>
        )}
        <ResizablePanel id="panel-canvas" minSize="30%">
          <CanvasPlaceholder />
        </ResizablePanel>
        {rightOpen && (
          <>
            <ResizableHandle />
            <ResizablePanel id="panel-right" defaultSize="26%" minSize="18%" maxSize="45%">
              <RightPanel />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
      <StatusBar />
      <CommandPalette />
      <ImportDialog />
      <ExportDialog />
      <ProblemsDialog />
    </div>
  );
}

type LoadState = { status: 'loading' } | { status: 'missing' } | { status: 'ready' };

export function EditorShell({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const project = useEditor((s) => (s.project?.id === projectId ? s.project : null));
  const isDesktop = useIsDesktop();
  useAutosave();

  useEffect(() => {
    let cancelled = false;
    getProject(projectId).then(
      (stored) => {
        if (cancelled) return;
        if (!stored) {
          setLoad({ status: 'missing' });
          return;
        }
        editorStore.getState().load(stored);
        setLoad({ status: 'ready' });
      },
      () => {
        if (!cancelled) setLoad({ status: 'missing' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (project) document.title = `${project.name} · DashDB`;
  }, [project]);

  if (load.status === 'missing') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Project not found</h1>
        <p className="text-text-muted">
          It may have been deleted, or it was created in another browser.
        </p>
        <Button asChild>
          <Link href="/app">Back to projects</Link>
        </Button>
      </main>
    );
  }
  if (load.status === 'loading' || !project) {
    return (
      <div className="flex h-dvh flex-col gap-3 p-3" aria-busy="true" aria-label="Loading project">
        <Skeleton className="h-10 w-full" />
        <div className="flex flex-1 gap-3">
          <Skeleton className="w-60" />
          <Skeleton className="flex-1" />
          <Skeleton className="w-80" />
        </div>
      </div>
    );
  }
  return isDesktop ? <EditorLayout /> : <ReadOnlyView project={project} />;
}
