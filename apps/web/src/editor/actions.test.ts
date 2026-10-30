import { createSchema } from '@dashdb/core';
import { describe, expect, it, vi } from 'vitest';
import { ACTIONS, getAction, isActionEnabled, runAction, type ActionContext } from './actions';
import { parseShortcut } from './shortcuts';
import { createEditorStore } from './store';

function context() {
  const store = createEditorStore();
  store.getState().load({
    id: 'p',
    name: 'Shop',
    schema: createSchema('postgres'),
    createdAt: 1,
    updatedAt: 1,
  });
  const goToProjects = vi.fn();
  const toggleTheme = vi.fn();
  const ctx = (): ActionContext => ({ state: store.getState(), goToProjects, toggleTheme });
  return { store, ctx, goToProjects, toggleTheme };
}

describe('action registry', () => {
  it('gives every action a unique id and a unique, valid shortcut', () => {
    const ids = ACTIONS.map((a) => a.id);
    const shortcuts = ACTIONS.map((a) => a.shortcut);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    for (const shortcut of shortcuts) expect(() => parseShortcut(shortcut)).not.toThrow();
  });

  it('only lets chorded shortcuts fire inside text fields', () => {
    for (const action of ACTIONS) {
      if (!('allowInInput' in action)) continue;
      const parsed = parseShortcut(action.shortcut);
      expect(parsed.mod || parsed.alt, action.id).toBe(true);
    }
  });

  it('runs every action without throwing', () => {
    const { ctx } = context();
    ctx().state.addTable();
    for (const action of ACTIONS) {
      expect(() => {
        action.run(ctx());
      }).not.toThrow();
    }
  });

  it('respects isEnabled', () => {
    const { store, ctx } = context();
    const undo = getAction('edit.undo');
    expect(isActionEnabled(undo, store.getState())).toBe(false);
    expect(runAction(undo, ctx())).toBe(false);

    expect(runAction(getAction('schema.addTable'), ctx())).toBe(true);
    expect(store.getState().project?.schema.tables).toHaveLength(1);
    expect(runAction(undo, ctx())).toBe(true);
    expect(store.getState().project?.schema.tables).toHaveLength(0);
  });

  it('wires navigation, theme, dialogs and tabs', () => {
    const { store, ctx, goToProjects, toggleTheme } = context();
    runAction(getAction('navigate.projects'), ctx());
    runAction(getAction('view.toggleTheme'), ctx());
    expect(goToProjects).toHaveBeenCalledOnce();
    expect(toggleTheme).toHaveBeenCalledOnce();

    runAction(getAction('migration.generate'), ctx());
    expect(store.getState().rightTab).toBe('migration');
    runAction(getAction('file.import'), ctx());
    expect(store.getState().dialog).toBe('import');
    runAction(getAction('palette.open'), ctx());
    expect(store.getState().paletteOpen).toBe(true);
  });

  it('throws for unknown ids', () => {
    expect(() => getAction('nope' as never)).toThrow();
  });
});
