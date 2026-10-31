import { describe, expect, it, vi } from 'vitest';
import {
  ACTIONS,
  getAction,
  isActionEnabled,
  runAction,
  shortcutsOf,
  type ActionContext,
  type EditorAction,
} from './actions';
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
  const copyMermaid = vi.fn();
  const restartTour = vi.fn();
  const reportPaste = vi.fn();
  const ctx = (): ActionContext => ({
    state: store.getState(),
    goToProjects,
    toggleTheme,
    saveBaseline,
    downloadProject,
    copyMermaid,
    restartTour,
    reportPaste,
  });
  return { store, ctx, goToProjects, toggleTheme, saveBaseline, downloadProject, copyMermaid };
}

describe('action registry', () => {
  it('gives every action a unique id and a unique, valid shortcut', () => {
    const ids = ACTIONS.map((a) => a.id);
    const shortcuts = (ACTIONS as readonly EditorAction[]).flatMap(shortcutsOf);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    for (const shortcut of shortcuts) expect(() => parseShortcut(shortcut)).not.toThrow();
  });

  it('only lets chorded shortcuts fire inside text fields', () => {
    for (const action of ACTIONS) {
      if (!('allowInInput' in action)) continue;
      for (const shortcut of shortcutsOf(action)) {
        const parsed = parseShortcut(shortcut);
        expect(parsed.mod || parsed.alt, action.id).toBe(true);
      }
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

  it('wires the export entries, which need tables', () => {
    const { store, ctx, copyMermaid } = context();
    const image = getAction('file.exportImage');
    const mermaid = getAction('file.copyMermaid');
    expect(isActionEnabled(image, store.getState())).toBe(false);
    expect(isActionEnabled(mermaid, store.getState())).toBe(false);
    store.getState().addTable();
    runAction(image, ctx());
    expect(store.getState().dialog).toBe('exportImage');
    runAction(mermaid, ctx());
    expect(copyMermaid).toHaveBeenCalledOnce();
    store.getState().openExport('prisma');
    expect(store.getState()).toMatchObject({ dialog: 'export', exportFormat: 'prisma' });
  });

  it('binds the documented keys', () => {
    const keys = (id: Parameters<typeof getAction>[0]) => shortcutsOf(getAction(id));
    expect(keys('schema.addTable')).toEqual(['t']);
    expect(keys('schema.addColumn')).toEqual(['c']);
    expect(keys('schema.deleteTable')).toContain('delete');
    expect(keys('schema.deleteTable')).toContain('backspace');
    expect(keys('edit.undo')).toEqual(['mod+z']);
    expect(keys('edit.redo')).toEqual(['mod+shift+z']);
    expect(keys('edit.duplicate')).toEqual(['mod+d']);
    expect(keys('migration.generate')[0]).toBe('mod+g');
    expect(keys('view.searchTables')).toEqual(['/']);
    expect(keys('help.shortcuts')).toEqual(['shift+/']);
  });

  it('opens the cheat sheet and restarts the tour', () => {
    const { store, ctx } = context();
    runAction(getAction('help.shortcuts'), ctx());
    expect(store.getState().dialog).toBe('shortcuts');
    const c = ctx();
    runAction(getAction('help.tour'), c);
    expect(c.restartTour).toHaveBeenCalledOnce();
  });

  it('throws for unknown ids', () => {
    expect(() => getAction('nope' as never)).toThrow();
  });
});
