'use client';

import { toast, useTheme } from '@dashdb/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { ACTIONS, runAction, type ActionContext, type EditorAction } from './actions';
import { isEditableTarget, isMacPlatform, matchesShortcut } from './shortcuts';
import { downloadText } from '@/lib/download';
import { fileSlug } from './formats';
import { PROJECT_FILE_EXTENSION, serializeProjectFile } from './project-file';
import type { PasteOutcome } from './canvas/operations';
import { saveBaseline } from './projects';
import { editorStore } from './store';

function saveCurrentBaseline() {
  const { projectId, doc } = editorStore.getState();
  if (!projectId || !doc) return;
  const name = `Baseline ${new Date().toLocaleString()}`;
  saveBaseline(projectId, doc.schema, name).then(
    (baselines) => {
      editorStore.getState().setBaselines(baselines);
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
      for (const action of ACTIONS as readonly EditorAction[]) {
        if (!matchesShortcut(event, action.shortcut, isMac)) continue;
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
