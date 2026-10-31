'use client';

// Screen-reader announcements for things that change without moving focus (undo, edits made by
// shortcuts, tour progress): one polite live region for the whole editor.
import { useEffect, useSyncExternalStore } from 'react';
import type { HistoryEntry } from '../store/history';
import { editorStore } from '../store';

let message = '';
let nonce = 0;
const listeners = new Set<() => void>();

export function announce(text: string): void {
  // A repeated message still has to be read out, so alternate a zero-width suffix.
  nonce += 1;
  message = nonce % 2 === 0 ? text : `${text}​`;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** What a change to the undo history means, for announcing; null when nothing worth saying. */
export function describeHistoryChange(
  before: { past: readonly HistoryEntry[]; future: readonly HistoryEntry[] },
  after: { past: readonly HistoryEntry[]; future: readonly HistoryEntry[] },
): string | null {
  if (before.past === after.past && before.future === after.future) return null;
  // Undo moves the newest past entry to the front of the future; redo the reverse.
  if (after.future.length > before.future.length && after.future[0]) {
    return `Undid ${after.future[0].label.toLowerCase()}`;
  }
  const last = after.past.at(-1);
  if (last && last === before.future[0]) return `Redid ${last.label.toLowerCase()}`;
  // A merged edit (typing in a field) replaces the last entry; only new entries are announced.
  if (last && after.past.length > before.past.length) return last.label;
  return null;
}

/** The live region, plus announcements for every undoable edit. Render once in the editor. */
export function Announcer() {
  const text = useSyncExternalStore(
    subscribe,
    () => message,
    () => '',
  );
  useEffect(
    () =>
      editorStore.subscribe((state, previous) => {
        if (state.projectId !== previous.projectId) return;
        const said = describeHistoryChange(previous, state);
        if (said) announce(said);
      }),
    [],
  );
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid="announcer"
    >
      {text}
    </div>
  );
}
