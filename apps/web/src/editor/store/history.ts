// Patch-based undo history. Pure functions over immutable stacks.
import type { Patch } from 'immer';

export const HISTORY_LIMIT = 200;
/** Edits sharing a group key within this window merge into one undo step (drags, typing). */
export const GROUP_WINDOW_MS = 1000;

export interface HistoryEntry {
  readonly label: string;
  /** Edits with the same group key merge while they arrive within GROUP_WINDOW_MS. */
  readonly group: string | null;
  /** When the entry was last extended. */
  readonly at: number;
  readonly patches: readonly Patch[];
  readonly inversePatches: readonly Patch[];
}

export interface History {
  readonly past: readonly HistoryEntry[];
  readonly future: readonly HistoryEntry[];
}

export const EMPTY_HISTORY: History = { past: [], future: [] };

/** Records a new edit, merging it into the previous entry when it continues the same group. */
export function record(history: History, entry: HistoryEntry): History {
  const last = history.past.at(-1);
  if (
    last &&
    entry.group !== null &&
    last.group === entry.group &&
    entry.at - last.at < GROUP_WINDOW_MS
  ) {
    const merged: HistoryEntry = {
      label: last.label,
      group: last.group,
      at: entry.at,
      patches: [...last.patches, ...entry.patches],
      // Undo replays inverses newest-first.
      inversePatches: [...entry.inversePatches, ...last.inversePatches],
    };
    return { past: [...history.past.slice(0, -1), merged], future: [] };
  }
  return { past: [...history.past, entry].slice(-HISTORY_LIMIT), future: [] };
}

/** Moves the newest entry to the redo stack. Returns the entry to undo, or null. */
export function stepBack(history: History): { history: History; entry: HistoryEntry } | null {
  const entry = history.past.at(-1);
  if (!entry) return null;
  return {
    entry,
    history: { past: history.past.slice(0, -1), future: [entry, ...history.future] },
  };
}

/** Moves the next redo entry back onto the undo stack. Returns the entry to redo, or null. */
export function stepForward(history: History): { history: History; entry: HistoryEntry } | null {
  const entry = history.future[0];
  if (!entry) return null;
  return { entry, history: { past: [...history.past, entry], future: history.future.slice(1) } };
}
