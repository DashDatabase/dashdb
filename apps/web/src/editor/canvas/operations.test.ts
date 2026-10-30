import { beforeEach, describe, expect, it } from 'vitest';
import { createEditorStore, type EditorStore } from '../store';
import { testProject } from '../test-fixtures';
import { clearClipboard, PASTE_OFFSET } from './clipboard';
import { copySelection, duplicateSelection, pasteClipboard, selectedTableIds } from './operations';
import { shopSchema } from './test-schema';

let store: EditorStore;
const state = () => store.getState();
const names = () => state().doc?.schema.tables.map((t) => t.name) ?? [];

beforeEach(() => {
  clearClipboard();
  store = createEditorStore();
  state().load(testProject({ schema: shopSchema() }));
});

describe('canvas operations', () => {
  it('prefers the canvas multi-selection over the single selection', () => {
    const [a, b] = state().doc?.schema.tables.map((t) => t.id) ?? [];
    expect(selectedTableIds(state())).toEqual([]);
    state().select(a ?? null);
    expect(selectedTableIds(state())).toEqual([a]);
    state().setCanvasSelection([a ?? '', b ?? '']);
    expect(selectedTableIds(state())).toEqual([a, b]);
  });

  it('pastes as one undo step, selects the copies and offsets them', () => {
    expect(pasteClipboard(state())).toBe('empty');
    const customers = state().doc?.schema.tables[0];
    state().setCanvasSelection([customers?.id ?? '']);
    expect(copySelection(state())).toBe(true);
    const entries = state().past.length;

    expect(pasteClipboard(state())).toBe('pasted');
    expect(names()).toContain('customers_copy');
    expect(state().past).toHaveLength(entries + 1);
    const copyId = state().canvasSelection[0] ?? '';
    expect(state().selection.tableId).toBe(copyId);
    expect(state().doc?.layout.nodes[copyId]).toMatchObject({ x: PASTE_OFFSET, y: PASTE_OFFSET });

    state().undo();
    expect(names()).not.toContain('customers_copy');
    expect(state().canvasSelection).toEqual([]);
  });

  it('duplicates the selection and refuses pastes across database types', () => {
    const id = state().doc?.schema.tables[1]?.id ?? '';
    expect(duplicateSelection(state(), [id])).toBe('pasted');
    expect(names()).toContain('orders_copy');
    expect(state().past.at(-1)?.label).toBe('Duplicate table');

    state().load(testProject({ schema: { ...shopSchema(), dialect: 'mysql' } }));
    expect(pasteClipboard(state())).toBe('dialect');
  });
});
