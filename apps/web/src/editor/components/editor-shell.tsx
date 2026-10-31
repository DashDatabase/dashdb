'use client';

import { Button, ResizableHandle, ResizablePanel, ResizablePanelGroup, Skeleton } from '@dashdb/ui';
import { AlertTriangleIcon, CopyIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useEditorShortcuts, useIsDesktop } from '../hooks';
import { getProject, listBaselines, saveProject } from '../projects';
import { editorStore, useEditor } from '../store';
import { Canvas } from '../canvas/canvas';
import { attachAutosave } from '../store/autosave';
import { watchProjectTabs } from '../store/tab-sync';
import { CommandPalette } from './command-palette';
import { ExportDialog } from './export-dialog';
import { ExportImageDialog } from './export-image-dialog';
import { ImportDialog } from './import-dialog';
import { ReadOnlyView } from './read-only-view';
import { RightPanel } from './right-panel';
import { Sidebar } from './sidebar';
import { ProblemsDialog, StatusBar } from './status-bar';
import { TopBar } from './top-bar';

/** Autosave plus multi-tab coordination for the loaded project. */
function usePersistence(projectId: string, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const store = editorStore.getState();
    const tabs = watchProjectTabs(projectId, {
      onOtherTabs: (count) => {
        editorStore.getState().setOtherTabs(count);
      },
      onRemoteSave: (revision) => {
        // Another tab wrote a newer copy; saving from here would overwrite it.
        if (revision > editorStore.getState().revision) {
          editorStore.getState().setSaveState('conflict');
        }
      },
    });
    const autosave = attachAutosave(editorStore, async (project) => {
      const revision = await saveProject(project);
      tabs.announceSave(revision);
      return revision;
    });

    // Flush before the tab goes away or into the background (it may never come back).
    const flush = () => void autosave.flush();
    // Closing a tab skips React cleanup, so say goodbye to the other tabs here.
    const onPageHide = () => {
      flush();
      tabs.close();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      void autosave.flush().finally(() => {
        autosave.dispose();
      });
      tabs.close();
      store.setOtherTabs(0);
    };
  }, [projectId, active]);
}

function TabBanner() {
  const saveState = useEditor((s) => s.saveState);
  const otherTabs = useEditor((s) => s.otherTabs);

  if (saveState === 'conflict') {
    return (
      <div
        role="alert"
        className="flex items-center gap-3 border-b border-destructive/40 bg-danger/10 px-3 py-2 text-sm"
      >
        <AlertTriangleIcon className="size-4 shrink-0 text-danger-text" aria-hidden />
        <span className="flex-1">
          This project was changed in another tab, so changes here are no longer being saved. Reload
          to continue from the latest version.
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload
        </Button>
      </div>
    );
  }
  if (otherTabs > 0) {
    return (
      <div
        role="status"
        data-testid="other-tab-warning"
        className="flex items-center gap-3 border-b bg-warning/10 px-3 py-2 text-sm"
      >
        <CopyIcon className="size-4 shrink-0 text-warning-text" aria-hidden />
        This project is also open in another tab. Edit it in one tab at a time: once one tab saves,
        the other stops saving.
      </div>
    );
  }
  return null;
}

function EditorLayout() {
  const leftOpen = useEditor((s) => s.leftOpen);
  const rightOpen = useEditor((s) => s.rightOpen);
  useEditorShortcuts();

  return (
    <div className="flex h-dvh flex-col bg-background" data-testid="editor">
      <TopBar />
      <TabBanner />
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
          <Canvas />
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
      <ExportImageDialog />
      <ProblemsDialog />
    </div>
  );
}

type LoadState = 'loading' | 'missing' | 'ready';

export function EditorShell({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<LoadState>('loading');
  const doc = useEditor((s) => (s.projectId === projectId ? s.doc : null));
  const isDesktop = useIsDesktop();
  usePersistence(projectId, load === 'ready');

  useEffect(() => {
    let cancelled = false;
    Promise.all([getProject(projectId), listBaselines(projectId)]).then(
      ([stored, baselines]) => {
        if (cancelled) return;
        if (!stored) {
          setLoad('missing');
          return;
        }
        editorStore.getState().load(stored, baselines);
        setLoad('ready');
      },
      () => {
        if (!cancelled) setLoad('missing');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const name = doc?.name;
  useEffect(() => {
    if (name) document.title = `${name} · DashDB`;
  }, [name]);

  if (load === 'missing') {
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
  if (load === 'loading' || !doc) {
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
  return isDesktop ? <EditorLayout /> : <ReadOnlyView project={doc} />;
}
