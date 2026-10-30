import { describe, expect, it, vi } from 'vitest';
import { ACTIONS, getAction, isActionEnabled, runAction, type ActionContext } from './actions';
import { parseShortcut } from './shortcuts';
import { createEditorStore } from './store';
import { testProject } from './test-fixtures';

function context() {
  const store = createEditorStore();
  store.getState().load(testProject());
  const goToProjects = vi.fn();
  const toggleTheme = vi.fn();
  const saveBaseline = vi.fn();
  const downloadProject = vi.fn();
  const reportPaste = vi.fn();
  const ctx = (): ActionContext => ({
    state: store.getState(),
    goToProjects,
    toggleTheme,
    saveBaseline,
    downloadProject,
    reportPaste,
  });
  return { store, ctx, goToProjects, toggleTheme, saveBaseline, downloadProject };
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
    expect(store.getState().doc?.schema.tables).toHaveLength(1);
    expect(runAction(undo, ctx())).toBe(true);
    expect(store.getState().doc?.schema.tables).toHaveLength(0);
  });

  it('wires navigation, theme, dialogs and tabs', () => {
    const { store, ctx, goToProjects, toggleTheme, saveBaseline, downloadProject } = context();
    runAction(getAction('navigate.projects'), ctx());
    runAction(getAction('view.toggleTheme'), ctx());
    runAction(getAction('migration.saveBaseline'), ctx());
    runAction(getAction('file.exportProject'), ctx());
    expect(goToProjects).toHaveBeenCalledOnce();
    expect(toggleTheme).toHaveBeenCalledOnce();
    expect(saveBaseline).toHaveBeenCalledOnce();
    expect(downloadProject).toHaveBeenCalledOnce();

    runAction(getAction('migration.generate'), ctx());
    expect(store.getState().rightTab).toBe('migration');
    expect(store.getState().migrationRequest).toBe(1);
    runAction(getAction('file.import'), ctx());
    expect(store.getState().dialog).toBe('import');
    runAction(getAction('palette.open'), ctx());
    expect(store.getState().paletteOpen).toBe(true);
  });

  it('throws for unknown ids', () => {
    expect(() => getAction('nope' as never)).toThrow();
  });
});
