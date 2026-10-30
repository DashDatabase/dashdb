import { renameTable, updateColumn, validateSchema } from '@dashdb/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testProject } from '../test-fixtures';
import {
  createEditorStore,
  uniqueName,
  VALIDATION_DELAY_MS,
  type EditorStore,
} from './editor-store';
import { GROUP_WINDOW_MS, HISTORY_LIMIT } from './history';

let clock: number;
let store: EditorStore;
const state = () => store.getState();
const schema = () => {
  const doc = state().doc;
  if (!doc) throw new Error('no document loaded');
  return doc.schema;
};
const tableNames = () => schema().tables.map((t) => t.name);

beforeEach(() => {
  vi.useFakeTimers();
  clock = 1_000_000;
  store = createEditorStore({ now: () => clock });
  state().load(testProject());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('uniqueName', () => {
  it('suffixes until free', () => {
    expect(uniqueName('t', [])).toBe('t');
    expect(uniqueName('t', ['t', 't_2'])).toBe('t_3');
  });
});

describe('schema actions', () => {
  it('adds a table with a primary key and a layout node, creating the default namespace', () => {
    const id = state().addTable();
    expect(schema().namespaces.map((n) => n.name)).toEqual(['public']);
    const table = schema().tables.find((t) => t.id === id);
    expect(table?.name).toBe('new_table');
    expect(table?.primaryKey?.columns).toEqual([table?.columns[0]?.id]);
    expect(state().doc?.layout.nodes[id ?? '']).toEqual({
      x: 0,
      y: 0,
      collapsed: false,
      color: 'default',
    });
    expect(state().selection.tableId).toBe(id);
    expect(state().focusRequest?.tableId).toBe(id);

    state().addTable();
    expect(tableNames()).toEqual(['new_table', 'new_table_2']);
    expect(Object.keys(state().doc?.layout.nodes ?? {})).toHaveLength(2);
  });

  it('adds enums and columns, and deletes the selected table with its layout node', () => {
    const tableId = state().addTable() ?? '';
    expect(state().addEnum()).not.toBeNull();
    const columnId = state().addColumn(tableId);
    expect(state().selection).toEqual({ tableId, columnId });
    expect(schema().tables[0]?.columns.at(-1)?.nativeType).toBe('text');

    state().removeSelectedTable();
    expect(schema().tables).toEqual([]);
    expect(state().doc?.layout.nodes).toEqual({});
    expect(state().selection).toEqual({ tableId: null, columnId: null });
    expect(state().addColumn('missing')).toBeNull();
  });

  it('applies core edits and rejects ones that throw, leaving history untouched', () => {
    const tableId = state().addTable() ?? '';
    expect(state().editSchema('Rename', (s) => renameTable(s, tableId, 'users'))).toBe(true);
    expect(tableNames()).toEqual(['users']);

    const before = { doc: state().doc, past: state().past };
    expect(
      state().editSchema('Bad', (s) => updateColumn(s, tableId, 'missing-column', { name: 'x' })),
    ).toBe(false);
    expect(state().doc).toBe(before.doc);
    expect(state().past).toBe(before.past);
  });

  it('records minimal patches for core edits', () => {
    const tableId = state().addTable() ?? '';
    state().editSchema('Rename', (s) => renameTable(s, tableId, 'users'));
    expect(state().past.at(-1)?.patches).toEqual([
      { op: 'replace', path: ['schema', 'tables', 0, 'name'], value: 'users' },
    ]);
  });

  it('ignores edits that change nothing', () => {
    const tableId = state().addTable() ?? '';
    const entries = state().past.length;
    expect(state().editSchema('Same name', (s) => renameTable(s, tableId, 'new_table'))).toBe(
      false,
    );
    expect(state().past).toHaveLength(entries);
  });
});

describe('undo and redo', () => {
  it('undoes and redoes schema and layout together', () => {
    const id = state().addTable() ?? '';
    state().undo();
    expect(schema().tables).toEqual([]);
    expect(state().doc?.layout.nodes).toEqual({});
    expect(state().selection.tableId).toBeNull();

    state().redo();
    expect(tableNames()).toEqual(['new_table']);
    expect(state().doc?.layout.nodes[id]).toBeDefined();
  });

  it('clears redo when a new edit happens', () => {
    state().addTable();
    state().undo();
    expect(state().future).toHaveLength(1);
    state().addEnum();
    expect(state().future).toEqual([]);
  });

  it('labels each step with the user action', () => {
    const id = state().addTable() ?? '';
    state().setNodeColor(id, 'accent');
    state().rename('Store');
    expect(state().past.map((e) => e.label)).toEqual([
      'Add table',
      'Change table color',
      'Rename project',
    ]);
  });

  it('caps history at the limit', () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) state().addEnum();
    expect(state().past).toHaveLength(HISTORY_LIMIT);
  });

  it('is a no-op with nothing to undo or redo', () => {
    const doc = state().doc;
    state().undo();
    state().redo();
    expect(state().doc).toBe(doc);
  });
});

describe('undo grouping', () => {
  it('merges a drag into one step', () => {
    const id = state().addTable() ?? '';
    for (let x = 10; x <= 100; x += 10) {
      clock += 16;
      state().moveNode(id, { x, y: x / 2 });
    }
    expect(state().past.map((e) => e.label)).toEqual(['Add table', 'Move table']);
    expect(state().doc?.layout.nodes[id]).toMatchObject({ x: 100, y: 50 });

    state().undo();
    expect(state().doc?.layout.nodes[id]).toMatchObject({ x: 0, y: 0 });
    state().redo();
    expect(state().doc?.layout.nodes[id]).toMatchObject({ x: 100, y: 50 });
  });

  it('starts a new step after a pause or for a different node', () => {
    const a = state().addTable() ?? '';
    const b = state().addTable() ?? '';
    state().moveNode(a, { x: 1, y: 1 });
    clock += GROUP_WINDOW_MS + 1;
    state().moveNode(a, { x: 2, y: 2 });
    state().moveNode(b, { x: 3, y: 3 });
    expect(state().past.filter((e) => e.label === 'Move table')).toHaveLength(3);
  });

  it('does not merge ungrouped edits', () => {
    const id = state().addTable() ?? '';
    state().setNodeCollapsed(id, true);
    state().setNodeCollapsed(id, false);
    expect(state().past.map((e) => e.label)).toEqual([
      'Add table',
      'Collapse table',
      'Expand table',
    ]);
  });

  it('groups a transaction into one step that undoes atomically', () => {
    state().transact('Add two tables', () => {
      state().addTable();
      state().addTable();
      state().rename('Two tables');
    });
    expect(state().past.map((e) => e.label)).toEqual(['Add two tables']);
    expect(tableNames()).toHaveLength(2);

    state().undo();
    expect(schema().tables).toEqual([]);
    expect(state().doc?.name).toBe('Shop');
    state().redo();
    expect(tableNames()).toEqual(['new_table', 'new_table_2']);
    expect(state().doc?.name).toBe('Two tables');
  });

  it('records nothing for an empty transaction, and flattens nested ones', () => {
    state().transact('Nothing', () => undefined);
    expect(state().past).toEqual([]);
    state().transact('Outer', () => {
      state().addTable();
      state().transact('Inner', () => state().addEnum());
    });
    expect(state().past.map((e) => e.label)).toEqual(['Outer']);
  });
});

describe('validation', () => {
  it('re-validates on a debounce after schema changes', () => {
    const id = state().addTable() ?? '';
    state().addTable();
    state().editSchema('Duplicate', (s) => renameTable(s, id, 'new_table_2'));
    expect(state().problems).toEqual([]);

    vi.advanceTimersByTime(VALIDATION_DELAY_MS - 1);
    expect(state().problems).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(state().problems.map((p) => p.code)).toEqual(['duplicate-table-name']);

    state().undo();
    vi.advanceTimersByTime(VALIDATION_DELAY_MS);
    expect(state().problems).toEqual([]);
  });

  it('validates immediately on load', () => {
    const project = testProject();
    const broken = {
      ...project.schema,
      tables: [],
      namespaces: [
        { id: 'a', name: 'x' },
        { id: 'b', name: 'x' },
      ],
    };
    state().load({ ...project, schema: broken });
    expect(state().problems).toEqual(validateSchema(broken));
  });
});

describe('load and toProject', () => {
  it('round-trips document and view state', () => {
    const id = state().addTable() ?? '';
    state().moveNode(id, { x: 40, y: 80 });
    state().setRightTab('code');
    state().toggleLeft();
    const saved = state().toProject();
    if (!saved) throw new Error('nothing loaded');

    const reloaded = createEditorStore();
    reloaded.getState().load(saved);
    expect(reloaded.getState().toProject()).toEqual({
      ...saved,
      updatedAt: expect.any(Number) as number,
    });
    expect(reloaded.getState().past).toEqual([]);
  });

  it('fills in missing layout nodes and drops stale selections', () => {
    const project = testProject();
    store.getState().load(project);
    state().addTable();
    const withTable = state().toProject();
    if (!withTable) throw new Error('nothing loaded');

    state().load({
      ...withTable,
      layout: { nodes: {} },
      view: { ...withTable.view, selection: { tableId: 'gone', columnId: null } },
    });
    expect(Object.keys(state().doc?.layout.nodes ?? {})).toEqual([schema().tables[0]?.id]);
    expect(state().selection.tableId).toBeNull();
  });

  it('does nothing without a project', () => {
    const empty = createEditorStore();
    expect(empty.getState().addTable()).toBeNull();
    expect(empty.getState().editSchema('x', (s) => s)).toBe(false);
    expect(empty.getState().toProject()).toBeNull();
    empty.getState().undo();
    empty.getState().rename('x');
    expect(empty.getState().doc).toBeNull();
  });
});

describe('ui state', () => {
  it('manages panels, dialogs, the palette and tab status', () => {
    state().toggleRight();
    state().setRightTab('migration');
    expect(state()).toMatchObject({ rightTab: 'migration', rightOpen: true });

    state().setPaletteOpen(true);
    state().openDialog('export');
    expect(state()).toMatchObject({ dialog: 'export', paletteOpen: false });
    state().closeDialog();
    expect(state().dialog).toBeNull();

    state().toggleLeft();
    state().requestSearch();
    expect(state()).toMatchObject({ leftOpen: true, searchRequest: 1 });

    state().setOtherTabs(2);
    state().setSaveState('conflict');
    state().setRevision(7);
    expect(state()).toMatchObject({ otherTabs: 2, saveState: 'conflict', revision: 7 });
  });

  it('keeps UI changes out of undo history', () => {
    state().select(null);
    state().toggleLeft();
    state().setBaselines([]);
    expect(state().past).toEqual([]);
  });
});
