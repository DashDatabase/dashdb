import 'fake-indexeddb/auto';
import { createId } from '@dashdb/core';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashDb, db, setDb } from '../db';
import { ProjectConflictError, createProject, getProject, saveProject } from '../projects';
import { testProject } from '../test-fixtures';
import { AUTOSAVE_DELAY_MS, attachAutosave } from './autosave';
import { createEditorStore, type EditorStore } from './editor-store';
import type { Project } from './types';

let store: EditorStore;

beforeEach(() => {
  store = createEditorStore();
  store.getState().load(testProject());
});

describe('attachAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces edits into one save and records the new revision', async () => {
    const save = vi.fn((project: Project) => Promise.resolve(project.revision + 1));
    const autosave = attachAutosave(store, save);

    store.getState().addTable();
    store.getState().addTable();
    expect(store.getState().saveState).toBe('saving');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]?.[0].schema.tables).toHaveLength(2);
    expect(store.getState()).toMatchObject({ saveState: 'saved', revision: 1 });
    autosave.dispose();
  });

  it('saves view changes too, but not unrelated UI state', async () => {
    const save = vi.fn((project: Project) => Promise.resolve(project.revision + 1));
    attachAutosave(store, save);
    store.getState().setPaletteOpen(true);
    store.getState().openDialog('export');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).not.toHaveBeenCalled();

    store.getState().setRightTab('code');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save.mock.calls[0]?.[0].view.rightTab).toBe('code');
  });

  it('stops saving on a conflict and keeps the error state', async () => {
    const save = vi.fn(() => Promise.reject(new ProjectConflictError('changed')));
    attachAutosave(store, save);
    store.getState().addTable();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(store.getState().saveState).toBe('conflict');

    store.getState().addTable();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(save).toHaveBeenCalledOnce();
  });

  it('retries after a failed save', async () => {
    const save = vi
      .fn<(p: Project) => Promise<number>>()
      .mockRejectedValueOnce(new Error('quota'))
      .mockResolvedValue(1);
    const autosave = attachAutosave(store, save);
    store.getState().addTable();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(store.getState().saveState).toBe('error');

    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(store.getState().saveState).toBe('saved');
  });

  it('flushes immediately and ignores other projects being loaded', async () => {
    const save = vi.fn((project: Project) => Promise.resolve(project.revision + 1));
    const autosave = attachAutosave(store, save);
    store.getState().load(testProject({ id: 'other' }));
    await autosave.flush();
    expect(save).not.toHaveBeenCalled();

    store.getState().rename('Now');
    await autosave.flush();
    expect(save).toHaveBeenCalledOnce();
    autosave.dispose();
    store.getState().rename('Later');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledOnce();
  });
});

describe('reload', () => {
  let name: string;
  beforeEach(() => {
    name = `test-${createId()}`;
    setDb(new DashDb(name));
  });
  afterEach(async () => {
    db().close();
    await Dexie.delete(name);
  });

  it('restores document and view state exactly from IndexedDB', async () => {
    const created = await createProject({ name: 'Shop' });
    store.getState().load(created);
    const autosave = attachAutosave(store, saveProject);

    const s = store.getState();
    const tableId = s.addTable() ?? '';
    s.addColumn(tableId);
    store.getState().moveNode(tableId, { x: 120, y: 64 });
    store.getState().setNodeColor(tableId, 'accent');
    store.getState().setNodeCollapsed(tableId, true);
    store.getState().addEnum();
    store.getState().rename('Shop v2');
    store.getState().setRightTab('migration');
    store.getState().toggleLeft();
    await autosave.flush();
    autosave.dispose();

    const before = store.getState().toProject();
    const stored = await getProject(created.id);
    if (!stored || !before) throw new Error('missing project');

    const reloaded = createEditorStore();
    reloaded.getState().load(stored);
    const after = reloaded.getState().toProject();
    expect({ ...after, updatedAt: 0 }).toEqual({ ...before, updatedAt: 0 });
    expect(reloaded.getState().selection).toEqual(store.getState().selection);
    expect(stored.revision).toBe(1);
  });
});
