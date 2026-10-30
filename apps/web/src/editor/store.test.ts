import { createSchema, renameTable } from '@dashdb/core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Project } from './projects';
import { HISTORY_LIMIT, createEditorStore, uniqueName, type EditorStore } from './store';

function project(): Project {
  return { id: 'p', name: 'Shop', schema: createSchema('postgres'), createdAt: 1, updatedAt: 1 };
}

let store: EditorStore;
const state = () => store.getState();

beforeEach(() => {
  store = createEditorStore();
  state().load(project());
});

describe('uniqueName', () => {
  it('suffixes until free', () => {
    expect(uniqueName('t', [])).toBe('t');
    expect(uniqueName('t', ['t', 't_2'])).toBe('t_3');
  });
});

describe('editor store', () => {
  it('adds a table with a primary key, creating the default namespace', () => {
    const id = state().addTable();
    const schema = state().project?.schema;
    expect(schema?.namespaces.map((n) => n.name)).toEqual(['public']);
    const table = schema?.tables.find((t) => t.id === id);
    expect(table?.name).toBe('new_table');
    expect(table?.columns.map((c) => c.nativeType)).toEqual(['bigint']);
    expect(table?.primaryKey?.columns).toEqual([table?.columns[0]?.id]);
    expect(state().selection.tableId).toBe(id);
    expect(state().focusRequest?.tableId).toBe(id);

    state().addTable();
    expect(state().project?.schema.tables.map((t) => t.name)).toEqual(['new_table', 'new_table_2']);
  });

  it('undoes and redoes edits, clearing redo on a new edit', () => {
    const id = state().addTable() ?? '';
    state().edit((s) => renameTable(s, id, 'users'));
    expect(state().project?.schema.tables[0]?.name).toBe('users');

    state().undo();
    expect(state().project?.schema.tables[0]?.name).toBe('new_table');
    state().redo();
    expect(state().project?.schema.tables[0]?.name).toBe('users');

    state().undo();
    state().addEnum();
    expect(state().future).toEqual([]);
  });

  it('drops a selection that undo removed', () => {
    state().addTable();
    state().undo();
    expect(state().selection).toEqual({ tableId: null, columnId: null });
  });

  it('rejects failing edits without touching history', () => {
    const before = state().project?.schema;
    expect(
      state().edit(() => {
        throw new Error('bad');
      }),
    ).toBe(false);
    expect(state().project?.schema).toBe(before);
    expect(state().past).toEqual([]);
  });

  it('caps history', () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) state().addEnum();
    expect(state().past).toHaveLength(HISTORY_LIMIT);
  });

  it('adds columns and deletes the selected table', () => {
    const tableId = state().addTable() ?? '';
    const columnId = state().addColumn(tableId);
    expect(state().selection).toEqual({ tableId, columnId });
    expect(state().project?.schema.tables[0]?.columns.at(-1)?.nativeType).toBe('text');

    state().removeSelectedTable();
    expect(state().project?.schema.tables).toEqual([]);
    expect(state().selection.tableId).toBeNull();
    expect(state().addColumn('missing')).toBeNull();
  });

  it('renames with normalization and ignores no-ops', () => {
    state().rename('  Store ');
    expect(state().project?.name).toBe('Store');
    const updated = state().project;
    state().rename('Store');
    expect(state().project).toBe(updated);
  });

  it('manages panels, dialogs and the palette', () => {
    state().toggleRight();
    state().setRightTab('code');
    expect(state()).toMatchObject({ rightTab: 'code', rightOpen: true });

    state().setPaletteOpen(true);
    state().openDialog('export');
    expect(state()).toMatchObject({ dialog: 'export', paletteOpen: false });
    state().closeDialog();
    expect(state().dialog).toBeNull();

    state().toggleLeft();
    state().requestSearch();
    expect(state()).toMatchObject({ leftOpen: true, searchRequest: 1 });
  });

  it('does nothing without a project', () => {
    const empty = createEditorStore();
    expect(empty.getState().addTable()).toBeNull();
    expect(empty.getState().edit((s) => s)).toBe(false);
    empty.getState().undo();
    empty.getState().rename('x');
    expect(empty.getState().project).toBeNull();
  });
});
