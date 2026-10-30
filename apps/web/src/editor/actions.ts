// The editor's action registry. Every user-facing command lives here once, with a keyboard
// shortcut, so the command palette, toolbar buttons and key handler all stay in sync.
import type { EditorActions, EditorState } from './store';

export type ActionGroup = 'File' | 'Edit' | 'Schema' | 'View' | 'Navigate';

export interface ActionContext {
  readonly state: EditorState & EditorActions;
  readonly goToProjects: () => void;
  readonly toggleTheme: () => void;
}

export interface EditorAction {
  readonly id: string;
  readonly title: string;
  readonly group: ActionGroup;
  /** e.g. `mod+shift+z`; see shortcuts.ts. Unique across the registry. */
  readonly shortcut: string;
  readonly keywords?: readonly string[];
  /** Fire even while typing in a text field (only for chorded shortcuts). */
  readonly allowInInput?: boolean;
  readonly isEnabled?: (state: EditorState) => boolean;
  readonly run: (ctx: ActionContext) => void;
}

const hasProject = (state: EditorState) => state.project !== null;

export const ACTIONS = [
  {
    id: 'palette.open',
    title: 'Open command palette',
    group: 'View',
    shortcut: 'mod+k',
    allowInInput: true,
    run: ({ state }) => {
      state.setPaletteOpen(!state.paletteOpen);
    },
  },
  {
    id: 'edit.undo',
    title: 'Undo',
    group: 'Edit',
    shortcut: 'mod+z',
    isEnabled: (state) => state.past.length > 0,
    run: ({ state }) => {
      state.undo();
    },
  },
  {
    id: 'edit.redo',
    title: 'Redo',
    group: 'Edit',
    shortcut: 'mod+shift+z',
    isEnabled: (state) => state.future.length > 0,
    run: ({ state }) => {
      state.redo();
    },
  },
  {
    id: 'file.import',
    title: 'Import schema…',
    group: 'File',
    shortcut: 'mod+o',
    keywords: ['sql', 'prisma', 'dbml', 'open', 'upload'],
    allowInInput: true,
    isEnabled: hasProject,
    run: ({ state }) => {
      state.openDialog('import');
    },
  },
  {
    id: 'file.export',
    title: 'Export schema…',
    group: 'File',
    shortcut: 'mod+shift+e',
    keywords: ['sql', 'prisma', 'drizzle', 'dbml', 'download'],
    allowInInput: true,
    isEnabled: hasProject,
    run: ({ state }) => {
      state.openDialog('export');
    },
  },
  {
    id: 'file.rename',
    title: 'Rename project',
    group: 'File',
    shortcut: 'f2',
    isEnabled: hasProject,
    run: ({ state }) => {
      state.openDialog('rename');
    },
  },
  {
    id: 'migration.generate',
    title: 'Generate migration',
    group: 'Schema',
    shortcut: 'mod+enter',
    keywords: ['diff', 'alter'],
    allowInInput: true,
    isEnabled: hasProject,
    run: ({ state }) => {
      state.setRightTab('migration');
    },
  },
  {
    id: 'schema.addTable',
    title: 'Add table',
    group: 'Schema',
    shortcut: 'n',
    keywords: ['create', 'new'],
    isEnabled: hasProject,
    run: ({ state }) => {
      state.addTable();
    },
  },
  {
    id: 'schema.addEnum',
    title: 'Add enum',
    group: 'Schema',
    shortcut: 'shift+n',
    keywords: ['create', 'new', 'type'],
    isEnabled: hasProject,
    run: ({ state }) => {
      state.addEnum();
    },
  },
  {
    id: 'schema.addColumn',
    title: 'Add column to selected table',
    group: 'Schema',
    shortcut: 'c',
    keywords: ['field', 'new'],
    isEnabled: (state) => state.selection.tableId !== null,
    run: ({ state }) => {
      if (state.selection.tableId) state.addColumn(state.selection.tableId);
    },
  },
  {
    id: 'schema.deleteTable',
    title: 'Delete selected table',
    group: 'Schema',
    shortcut: 'mod+backspace',
    keywords: ['remove', 'drop'],
    isEnabled: (state) => state.selection.tableId !== null,
    run: ({ state }) => {
      state.removeSelectedTable();
    },
  },
  {
    id: 'view.focusSelected',
    title: 'Focus selected table on canvas',
    group: 'View',
    shortcut: 'f',
    isEnabled: (state) => state.selection.tableId !== null,
    run: ({ state }) => {
      if (state.selection.tableId) state.focusTable(state.selection.tableId);
    },
  },
  {
    id: 'view.searchTables',
    title: 'Search tables',
    group: 'View',
    shortcut: '/',
    keywords: ['find', 'filter'],
    run: ({ state }) => {
      state.requestSearch();
    },
  },
  {
    id: 'view.toggleSidebar',
    title: 'Toggle sidebar',
    group: 'View',
    shortcut: 'mod+b',
    allowInInput: true,
    run: ({ state }) => {
      state.toggleLeft();
    },
  },
  {
    id: 'view.toggleRightPanel',
    title: 'Toggle right panel',
    group: 'View',
    shortcut: 'mod+alt+b',
    allowInInput: true,
    run: ({ state }) => {
      state.toggleRight();
    },
  },
  {
    id: 'view.inspector',
    title: 'Show inspector',
    group: 'View',
    shortcut: 'alt+1',
    allowInInput: true,
    run: ({ state }) => {
      state.setRightTab('inspector');
    },
  },
  {
    id: 'view.code',
    title: 'Show code',
    group: 'View',
    shortcut: 'alt+2',
    allowInInput: true,
    run: ({ state }) => {
      state.setRightTab('code');
    },
  },
  {
    id: 'view.migration',
    title: 'Show migration',
    group: 'View',
    shortcut: 'alt+3',
    allowInInput: true,
    run: ({ state }) => {
      state.setRightTab('migration');
    },
  },
  {
    id: 'view.problems',
    title: 'Show problems',
    group: 'View',
    shortcut: 'mod+shift+m',
    keywords: ['errors', 'validation', 'warnings'],
    allowInInput: true,
    isEnabled: hasProject,
    run: ({ state }) => {
      state.openDialog('problems');
    },
  },
  {
    id: 'view.toggleTheme',
    title: 'Toggle light/dark theme',
    group: 'View',
    shortcut: 'mod+shift+l',
    keywords: ['dark mode', 'appearance'],
    allowInInput: true,
    run: ({ toggleTheme }) => {
      toggleTheme();
    },
  },
  {
    id: 'navigate.projects',
    title: 'Go to projects',
    group: 'Navigate',
    shortcut: 'mod+alt+h',
    keywords: ['home', 'back'],
    allowInInput: true,
    run: ({ goToProjects }) => {
      goToProjects();
    },
  },
] as const satisfies readonly EditorAction[];

export type ActionId = (typeof ACTIONS)[number]['id'];

const byId = new Map<string, EditorAction>(ACTIONS.map((action) => [action.id, action]));

export function getAction(id: ActionId): EditorAction {
  const action = byId.get(id);
  if (!action) throw new Error(`Unknown action ${id}`);
  return action;
}

export function isActionEnabled(action: EditorAction, state: EditorState): boolean {
  return action.isEnabled?.(state) ?? true;
}

/** Runs an action if it is enabled; returns whether it ran. */
export function runAction(action: EditorAction, ctx: ActionContext): boolean {
  if (!isActionEnabled(action, ctx.state)) return false;
  action.run(ctx);
  return true;
}
