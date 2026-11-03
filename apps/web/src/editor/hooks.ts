'use client';

import { toMermaid } from '@dashdb/core/lite';
import { toast, useTheme } from '@dashdb/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { runAction, shortcutsOf, type ActionContext, type EditorAction } from './actions';
import { ALL_ACTIONS } from './edition-actions';
import { isEditableTarget, isMacPlatform, matchesShortcut } from './shortcuts';
import { downloadText } from '@/lib/download';
import { track } from '@/lib/telemetry';
import { fileSlug } from './formats';
import { PROJECT_FILE_EXTENSION, serializeProjectFile } from './project-file';
import type { PasteOutcome } from './canvas/operations';
import { tourStore } from './onboarding/tour';
import { saveBaseline } from './projects';
import { editorStore } from './store';

function saveCurrentBaseline() {
  const { projectId, doc } = editorStore.getState();
  if (!projectId || !doc) return;
  const name = `Baseline ${new Date().toLocaleString()}`;
  saveBaseline(projectId, doc.schema, name).then(
    (baselines) => {
      editorStore.getState().setBaselines(baselines);
      track('baseline_saved', { reason: 'manual' });
      toast.success('Baseline saved', { description: 'Keeping the 3 most recent baselines.' });
    },
    () => toast.error('Could not save the baseline.'),
  );
}

export function reportPaste(outcome: PasteOutcome): void {
  if (outcome === 'dialect') {
    toast.error('Tables copied from another database type cannot be pasted here.');
  }
}

function downloadCurrentProject() {
  const { doc, baselines } = editorStore.getState();
  if (!doc) return;
  downloadText(
    `${fileSlug(doc.name)}${PROJECT_FILE_EXTENSION}`,
    serializeProjectFile(doc, baselines),
    'application/json',
  );
}

function copyCurrentMermaid() {
  const { doc } = editorStore.getState();
  if (!doc) return;
  navigator.clipboard.writeText(toMermaid(doc.schema).code).then(
    () => toast.success('Mermaid ERD copied', { description: 'Paste it into a ```mermaid block.' }),
    () => toast.error('Could not copy to the clipboard'),
  );
}

/** Returns a function that builds a fresh ActionContext (current store state) at call time. */
export function useActionContext(): () => ActionContext {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  return useCallback(
    () => ({
      state: editorStore.getState(),
      goToProjects: () => {
        router.push('/app');
      },
      toggleTheme: () => {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
      },
      saveBaseline: saveCurrentBaseline,
      downloadProject: downloadCurrentProject,
      copyMermaid: copyCurrentMermaid,
      restartTour: () => {
        const { projectId } = editorStore.getState();
        if (projectId) tourStore.getState().start(projectId);
      },
      reportPaste,
    }),
    [router, resolvedTheme, setTheme],
  );
}

export function useRunAction(): (action: EditorAction) => void {
  const context = useActionContext();
  return useCallback(
    (action: EditorAction) => {
      runAction(action, context());
    },
    [context],
  );
}

/** Dispatches registry shortcuts from anywhere in the page. */
export function useEditorShortcuts(): void {
  const context = useActionContext();
  useEffect(() => {
    const isMac = isMacPlatform();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const editable = isEditableTarget(event.target);
      for (const action of ALL_ACTIONS) {
        if (!shortcutsOf(action).some((s) => matchesShortcut(event, s, isMac))) continue;
        if (editable && !action.allowInInput) return;
        event.preventDefault();
        runAction(action, context());
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [context]);
}

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  };
}

export const DESKTOP_QUERY = '(min-width: 1024px)';
const subscribeDesktop = subscribeMedia(DESKTOP_QUERY);

/** True at 1024px and wider: the editor's minimum supported width. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

export function useIsMac(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    isMacPlatform,
    () => false,
  );
}
