// The editor's action registry. Every user-facing command lives here once, with a keyboard
// shortcut, so the command palette, toolbar buttons and key handler all stay in sync.
import {
  copySelection,
  duplicateSelection,
  pasteClipboard,
  selectedTableIds,
  type PasteOutcome,
} from './canvas/operations';
import type { EditionCommand, EditorApi } from '@dashdb/edition';
import { readClipboard } from './canvas/clipboard';
import { parseShortcut } from './shortcuts';
import type { EditorActions, EditorState } from './store';

/** `Edition` holds the active edition's commands; it is listed only when there are some. */
export type ActionGroup = 'File' | 'Edit' | 'Schema' | 'View' | 'Navigate' | 'Help' | 'Edition';

/** Display order of groups in the palette and the shortcuts cheat sheet. */
export const GROUP_ORDER: readonly ActionGroup[] = [
  'File',
  'Edit',
  'Schema',
  'View',
  'Navigate',
  'Help',
];

export interface ActionContext {
  readonly state: EditorState & EditorActions;
  readonly goToProjects: () => void;
  readonly toggleTheme: () => void;
  /** Stores the current schema as a migration baseline. */
  readonly saveBaseline: () => void;
  /** Downloads the whole project as `.dashdb.json`. */
  readonly downloadProject: () => void;
  /** Copies the schema to the clipboard as a Mermaid ERD. */
  readonly copyMermaid: () => void;
  /** Starts the guided tour from its first step. */
  readonly restartTour: () => void;
  /** Shows a paste that could not happen (e.g. tables from another database type). */
  readonly reportPaste: (outcome: PasteOutcome) => void;
}

export interface EditorAction {
  readonly id: string;
  readonly title: string;
  readonly group: ActionGroup;
  /**
   * e.g. `mod+shift+z`; see shortcuts.ts. Unique across the registry. Shown in the UI. Empty
   * only for edition commands without one.
   */
  readonly shortcut: string;
  /** Further keys that also run the action (e.g. Backspace where keyboards lack Delete). */
  readonly altShortcuts?: readonly string[];
  readonly keywords?: readonly string[];
  /** Fire even while typing in a text field (only for chorded shortcuts). */
  readonly allowInInput?: boolean;
  readonly isEnabled?: (state: EditorState) => boolean;
  readonly run: (ctx: ActionContext) => void;
}

/** Every key combination that runs `action`, the displayed one first. */
export function shortcutsOf(action: EditorAction): readonly string[] {
  return [action.shortcut, ...(action.altShortcuts ?? [])].filter(Boolean);
}

const hasProject = (state: EditorState) => state.doc !== null;
const hasTables = (state: EditorState) => (state.doc?.schema.tables.length ?? 0) > 0;
const hasSelectedTables = (state: EditorState) => selectedTableIds(state).length > 0;

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
    id: 'edit.copy',
    title: 'Copy selected tables',
    group: 'Edit',
    shortcut: 'mod+c',
    isEnabled: hasSelectedTables,
    run: ({ state }) => {
      copySelection(state);
    },
  },
  {
    id: 'edit.paste',
    title: 'Paste tables',
    group: 'Edit',
    shortcut: 'mod+v',
    isEnabled: (state) => state.doc !== null && readClipboard() !== null,
    run: ({ state, reportPaste }) => {
      reportPaste(pasteClipboard(state));
    },
  },
  {
    id: 'edit.duplicate',
    title: 'Duplicate selected tables',
    group: 'Edit',
    shortcut: 'mod+d',
    keywords: ['copy', 'clone'],
    isEnabled: hasSelectedTables,
    run: ({ state, reportPaste }) => {
      reportPaste(duplicateSelection(state));
    },
  },
  {
    id: 'edit.selectAll',
    title: 'Select all tables',
    group: 'Edit',
    shortcut: 'mod+a',
    isEnabled: hasTables,
    run: ({ state }) => {
      state.runCanvasCommand('selectAll');
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
    id: 'file.exportImage',
    title: 'Export diagram as image (PNG, SVG)…',
    group: 'File',
    shortcut: 'mod+alt+e',
    keywords: ['png', 'svg', 'picture', 'screenshot', 'download'],
    allowInInput: true,
    isEnabled: hasTables,
    run: ({ state }) => {
      state.openDialog('exportImage');
    },
  },
  {
    id: 'file.copyMermaid',
    title: 'Copy as Mermaid ERD',
    group: 'File',
    shortcut: 'mod+alt+m',
    keywords: ['mermaid', 'erd', 'markdown', 'diagram', 'clipboard'],
    allowInInput: true,
    isEnabled: hasTables,
    run: ({ copyMermaid }) => {
      copyMermaid();
    },
  },
  {
    id: 'file.exportProject',
    title: 'Download project file (.dashdb.json)',
    group: 'File',
    shortcut: 'mod+shift+s',
    keywords: ['backup', 'save as', 'json'],
    allowInInput: true,
    isEnabled: hasProject,
    run: ({ downloadProject }) => {
      downloadProject();
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
    shortcut: 'mod+g',
    altShortcuts: ['mod+enter'],
    keywords: ['diff', 'alter'],
    allowInInput: true,
    isEnabled: hasProject,
    run: ({ state }) => {
      state.requestMigration();
    },
  },
  {
    id: 'migration.saveBaseline',
    title: 'Save baseline',
    group: 'Schema',
    shortcut: 'mod+alt+s',
    keywords: ['snapshot', 'before', 'checkpoint'],
    allowInInput: true,
    isEnabled: hasProject,
    run: ({ saveBaseline }) => {
      saveBaseline();
    },
  },
  {
    id: 'schema.addTable',
    title: 'Add table',
    group: 'Schema',
    shortcut: 't',
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
    title: 'Delete selected tables…',
    group: 'Schema',
    shortcut: 'delete',
    // Mac keyboards have no Delete key; Backspace is what "delete" means there.
    altShortcuts: ['backspace', 'mod+backspace'],
    keywords: ['remove', 'drop'],
    isEnabled: hasSelectedTables,
    run: ({ state }) => {
      state.requestDeleteTables(selectedTableIds(state));
    },
  },
  {
    id: 'view.arrange',
    title: 'Arrange tables automatically',
    group: 'View',
    shortcut: 'mod+shift+a',
    keywords: ['layout', 'auto', 'tidy', 'organize'],
    isEnabled: hasTables,
    run: ({ state }) => {
      state.runCanvasCommand('arrange');
    },
  },
  {
    id: 'view.fitView',
    title: 'Fit diagram to view',
    group: 'View',
    shortcut: 'shift+1',
    keywords: ['zoom', 'show all'],
    isEnabled: hasTables,
    run: ({ state }) => {
      state.runCanvasCommand('fitView');
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
      state.requestMigration();
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
  {
    id: 'help.shortcuts',
    title: 'Keyboard shortcuts',
    group: 'Help',
    shortcut: 'shift+/',
    keywords: ['keys', 'cheat sheet', 'help', 'hotkeys'],
    run: ({ state }) => {
      state.openDialog('shortcuts');
    },
  },
  {
    id: 'help.tour',
    title: 'Restart guided tour',
    group: 'Help',
    shortcut: 'mod+alt+o',
    keywords: ['onboarding', 'tutorial', 'help', 'getting started'],
    allowInInput: true,
    isEnabled: hasProject,
    run: ({ restartTour }) => {
      restartTour();
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

function isValidShortcut(shortcut: string): boolean {
  try {
    parseShortcut(shortcut);
    return true;
  } catch {
    return false;
  }
}

/**
 * The active edition's commands as actions in the `Edition` group. A shortcut that is invalid or
 * already used by `existing` is dropped, so an edition can never take over a built-in key.
 */
export function editionActions(
  commands: readonly EditionCommand[],
  editor: EditorApi,
  existing: readonly EditorAction[] = ACTIONS,
): EditorAction[] {
  const taken = new Set(existing.flatMap(shortcutsOf).map((s) => s.toLowerCase()));
  return commands.map((command) => {
    const shortcut = command.shortcut?.toLowerCase() ?? '';
    const usable = shortcut !== '' && isValidShortcut(shortcut) && !taken.has(shortcut);
    if (usable) taken.add(shortcut);
    return {
      id: `edition.${command.id}`,
      title: command.label,
      group: 'Edition',
      shortcut: usable ? shortcut : '',
      allowInInput: false,
      run: () => {
        command.run(editor);
      },
    };
  });
}
