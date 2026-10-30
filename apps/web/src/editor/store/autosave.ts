// Debounced, revision-checked persistence for the open project.
import { ProjectConflictError } from '../projects';
import type { EditorStore } from './editor-store';
import type { Project } from './types';

export const AUTOSAVE_DELAY_MS = 500;

export interface Autosave {
  /** Saves any pending change now (e.g. before the page unloads). */
  flush: () => Promise<void>;
  dispose: () => void;
}

/**
 * Watches the store and saves the project shortly after it changes.
 *
 * Crash safety: each save is one IndexedDB transaction (all or nothing), saves are serialized,
 * and the page flushes on `pagehide`/`visibilitychange`, so at most the last ~500ms of edits
 * can be lost. A save that finds a newer revision on disk stops autosave (state "conflict")
 * rather than overwrite another tab.
 */
export function attachAutosave(
  store: EditorStore,
  save: (project: Project) => Promise<number>,
  { delay = AUTOSAVE_DELAY_MS }: { delay?: number } = {},
): Autosave {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  /** Counts edits so a save that finishes after a newer edit doesn't report "saved". */
  let edits = 0;
  let saving: Promise<void> = Promise.resolve();

  const run = async () => {
    timer = undefined;
    const state = store.getState();
    if (!dirty || state.saveState === 'conflict') return;
    const project = state.toProject();
    if (!project) return;
    dirty = false;
    const version = edits;
    try {
      const revision = await save(project);
      store.getState().setRevision(revision);
      if (version === edits) store.getState().setSaveState('saved');
    } catch (error) {
      if (error instanceof ProjectConflictError) {
        store.getState().setSaveState('conflict');
      } else {
        // Keep the change pending so the next edit (or flush) retries it.
        dirty = true;
        store.getState().setSaveState('error');
      }
    }
  };

  /** Saves never overlap: each waits for the previous one to settle. */
  const flush = () => {
    clearTimeout(timer);
    saving = saving.then(run);
    return saving;
  };

  const unsubscribe = store.subscribe((state, previous) => {
    if (state.projectId === null || state.projectId !== previous.projectId) return;
    const changed =
      state.docVersion !== previous.docVersion ||
      state.selection !== previous.selection ||
      state.rightTab !== previous.rightTab ||
      state.leftOpen !== previous.leftOpen ||
      state.rightOpen !== previous.rightOpen;
    if (!changed || state.saveState === 'conflict') return;
    dirty = true;
    edits++;
    if (state.saveState !== 'saving') state.setSaveState('saving');
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), delay);
  });

  return {
    flush,
    dispose: () => {
      unsubscribe();
      clearTimeout(timer);
    },
  };
}
