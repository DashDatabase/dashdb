import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '../store/history';
import { describeHistoryChange } from './announcer';

const entry = (label: string): HistoryEntry => ({
  label,
  group: null,
  at: 0,
  patches: [],
  inversePatches: [],
});

describe('describeHistoryChange', () => {
  const add = entry('Add table');
  const rename = entry('Rename column');

  it('announces new edits by their label', () => {
    expect(
      describeHistoryChange({ past: [add], future: [] }, { past: [add, rename], future: [] }),
    ).toBe('Rename column');
  });

  it('announces undo and redo', () => {
    const before = { past: [add, rename], future: [] };
    const undone = { past: [add], future: [rename] };
    expect(describeHistoryChange(before, undone)).toBe('Undid rename column');
    expect(describeHistoryChange(undone, before)).toBe('Redid rename column');
  });

  it('announces a new edit made after an undo', () => {
    const fresh = entry('Add enum');
    expect(
      describeHistoryChange({ past: [add], future: [rename] }, { past: [add, fresh], future: [] }),
    ).toBe('Add enum');
  });

  it('stays quiet when nothing new happened', () => {
    const same = { past: [add], future: [] };
    expect(describeHistoryChange(same, same)).toBeNull();
    // A merged edit (typing) replaces the last entry without adding one.
    expect(describeHistoryChange(same, { past: [entry('Add table')], future: [] })).toBeNull();
    // A new edit after undo clears the future: that is not a redo.
    expect(
      describeHistoryChange({ past: [add], future: [rename] }, { past: [add], future: [] }),
    ).toBeNull();
  });
});
