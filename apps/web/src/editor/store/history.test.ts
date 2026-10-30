import type { Patch } from 'immer';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_HISTORY,
  GROUP_WINDOW_MS,
  HISTORY_LIMIT,
  record,
  stepBack,
  stepForward,
  type HistoryEntry,
} from './history';

const patch = (value: number): Patch => ({ op: 'replace', path: ['v'], value });
const entry = (n: number, group: string | null = null, at = n): HistoryEntry => ({
  label: `edit ${String(n)}`,
  group,
  at,
  patches: [patch(n)],
  inversePatches: [patch(n - 1)],
});

describe('record', () => {
  it('appends entries and clears the redo stack', () => {
    const history = record({ past: [entry(1)], future: [entry(9)] }, entry(2));
    expect(history.past.map((e) => e.label)).toEqual(['edit 1', 'edit 2']);
    expect(history.future).toEqual([]);
  });

  it('merges same-group edits inside the window, keeping inverse order newest-first', () => {
    let history = record(EMPTY_HISTORY, entry(1, 'drag', 0));
    history = record(history, entry(2, 'drag', GROUP_WINDOW_MS - 1));
    // The window slides with each merged edit.
    history = record(history, entry(3, 'drag', 2 * GROUP_WINDOW_MS - 2));
    expect(history.past).toHaveLength(1);
    expect(history.past[0]?.label).toBe('edit 1');
    expect(history.past[0]?.patches).toEqual([patch(1), patch(2), patch(3)]);
    expect(history.past[0]?.inversePatches).toEqual([patch(2), patch(1), patch(0)]);
  });

  it('does not merge across groups, ungrouped edits or the window', () => {
    const a = record(record(EMPTY_HISTORY, entry(1, 'a', 0)), entry(2, 'b', 1));
    const b = record(record(EMPTY_HISTORY, entry(1, null, 0)), entry(2, null, 1));
    const c = record(record(EMPTY_HISTORY, entry(1, 'a', 0)), entry(2, 'a', GROUP_WINDOW_MS));
    expect([a, b, c].map((h) => h.past.length)).toEqual([2, 2, 2]);
  });

  it('keeps at most HISTORY_LIMIT entries, dropping the oldest', () => {
    let history = EMPTY_HISTORY;
    for (let i = 1; i <= HISTORY_LIMIT + 1; i++) history = record(history, entry(i));
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]?.label).toBe('edit 2');
  });
});

describe('stepBack and stepForward', () => {
  it('moves entries between the stacks', () => {
    const start = { past: [entry(1), entry(2)], future: [] };
    const back = stepBack(start);
    expect(back?.entry.label).toBe('edit 2');
    expect(back?.history.future.map((e) => e.label)).toEqual(['edit 2']);

    const forward = back && stepForward(back.history);
    expect(forward?.entry.label).toBe('edit 2');
    expect(forward?.history).toEqual(start);
  });

  it('returns null at either end', () => {
    expect(stepBack(EMPTY_HISTORY)).toBeNull();
    expect(stepForward(EMPTY_HISTORY)).toBeNull();
  });
});
