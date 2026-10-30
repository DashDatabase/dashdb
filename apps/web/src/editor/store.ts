// Editor state: the open project, undo/redo history, selection and UI panels.
import {
  addColumn,
  addEnum,
  addNamespace,
  addTable,
  createId,
  removeTable,
  toNativeType,
  type Id,
  type Schema,
} from '@dashdb/core';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { normalizeProjectName, type Project } from './projects';

export const HISTORY_LIMIT = 100;

export type RightTab = 'inspector' | 'code' | 'migration';
export type EditorDialog = 'import' | 'export' | 'problems' | 'rename';
export type SaveState = 'saved' | 'saving' | 'error';

export interface Selection {
  readonly tableId: Id | null;
  readonly columnId: Id | null;
}

export interface EditorState {
  project: Project | null;
  past: readonly Schema[];
  future: readonly Schema[];
  selection: Selection;
  /** Bumped on every request so the canvas re-centers even on the same table. */
  focusRequest: { tableId: Id; nonce: number } | null;
  rightTab: RightTab;
  leftOpen: boolean;
  rightOpen: boolean;
  dialog: EditorDialog | null;
  paletteOpen: boolean;
  searchRequest: number;
  saveState: SaveState;
}

export interface EditorActions {
  load: (project: Project) => void;
  /** Applies an immutable edit as one undo step. Returns false (and changes nothing) if it throws. */
  edit: (change: (schema: Schema) => Schema) => boolean;
  /** Replaces the whole schema (e.g. an import) as one undo step. */
  replaceSchema: (schema: Schema) => void;
  undo: () => void;
  redo: () => void;
  rename: (name: string) => void;
  select: (tableId: Id | null, columnId?: Id | null) => void;
  focusTable: (tableId: Id) => void;
  addTable: () => Id | null;
  addEnum: () => Id | null;
  addColumn: (tableId: Id) => Id | null;
  removeSelectedTable: () => void;
  setRightTab: (tab: RightTab) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  openDialog: (dialog: EditorDialog) => void;
  closeDialog: () => void;
  setPaletteOpen: (open: boolean) => void;
  requestSearch: () => void;
  setSaveState: (state: SaveState) => void;
}

export type EditorStore = StoreApi<EditorState & EditorActions>;

/** `base`, or `base_2`, `base_3`… — the first not already in `taken`. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const names = new Set(taken);
  if (!names.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}_${String(n)}`;
    if (!names.has(candidate)) return candidate;
  }
}

/** The namespace new elements go into, creating `public`/`main` if the schema has none. */
function withDefaultNamespace(schema: Schema): { schema: Schema; namespaceId: Id } {
  const first = schema.namespaces[0];
  if (first) return { schema, namespaceId: first.id };
  const name = schema.dialect === 'sqlite' ? 'main' : 'public';
  const next = addNamespace(schema, { name });
  const created = next.namespaces[0];
  if (!created) throw new Error('Namespace was not created');
  return { schema: next, namespaceId: created.id };
}

function idColumnType(schema: Schema): string {
  return schema.dialect === 'sqlite'
    ? 'integer'
    : toNativeType(schema.dialect, { kind: 'bigint' }, { enums: [] });
}

const initialUi = {
  past: [],
  future: [],
  selection: { tableId: null, columnId: null },
  focusRequest: null,
  rightTab: 'inspector',
  dialog: null,
  paletteOpen: false,
  searchRequest: 0,
  saveState: 'saved',
} satisfies Partial<EditorState>;

export function createEditorStore(): EditorStore {
  return createStore<EditorState & EditorActions>()((set, get) => {
    /** Commits a new schema: pushes history, clears redo, drops a selection that no longer exists. */
    const commit = (schema: Schema) => {
      const { project, past, selection } = get();
      if (!project || schema === project.schema) return;
      set({
        project: { ...project, schema, updatedAt: Date.now() },
        past: [...past, project.schema].slice(-HISTORY_LIMIT),
        future: [],
        selection: validSelection(schema, selection),
      });
    };

    return {
      project: null,
      ...initialUi,
      leftOpen: true,
      rightOpen: true,

      load: (project) => {
        set({ project, ...initialUi });
      },

      edit: (change) => {
        const { project } = get();
        if (!project) return false;
        try {
          commit(change(project.schema));
          return true;
        } catch {
          return false;
        }
      },

      replaceSchema: (schema) => {
        commit(schema);
      },

      undo: () => {
        const { project, past, future, selection } = get();
        const previous = past.at(-1);
        if (!project || !previous) return;
        set({
          project: { ...project, schema: previous, updatedAt: Date.now() },
          past: past.slice(0, -1),
          future: [project.schema, ...future],
          selection: validSelection(previous, selection),
        });
      },

      redo: () => {
        const { project, past, future, selection } = get();
        const next = future[0];
        if (!project || !next) return;
        set({
          project: { ...project, schema: next, updatedAt: Date.now() },
          past: [...past, project.schema],
          future: future.slice(1),
          selection: validSelection(next, selection),
        });
      },

      rename: (name) => {
        const { project } = get();
        if (!project) return;
        const normalized = normalizeProjectName(name);
        if (normalized === project.name) return;
        set({ project: { ...project, name: normalized, updatedAt: Date.now() } });
      },

      select: (tableId, columnId = null) => {
        set({ selection: { tableId, columnId } });
      },

      focusTable: (tableId) => {
        set((state) => ({
          selection: { tableId, columnId: null },
          focusRequest: { tableId, nonce: (state.focusRequest?.nonce ?? 0) + 1 },
        }));
      },

      addTable: () => {
        const { project } = get();
        if (!project) return null;
        const { schema, namespaceId } = withDefaultNamespace(project.schema);
        const name = uniqueName(
          'new_table',
          schema.tables.filter((t) => t.namespace === namespaceId).map((t) => t.name),
        );
        const withTable = addTable(schema, {
          name,
          namespace: namespaceId,
          columns: [
            {
              name: 'id',
              logicalType: { kind: 'bigint' },
              nativeType: idColumnType(schema),
              nullable: false,
            },
          ],
        });
        const table = withTable.tables.at(-1);
        const idColumn = table?.columns[0];
        if (!table || !idColumn) return null;
        commit({
          ...withTable,
          tables: withTable.tables.map((t) =>
            t.id === table.id
              ? { ...t, primaryKey: { id: createId(), name: null, columns: [idColumn.id] } }
              : t,
          ),
        });
        get().focusTable(table.id);
        return table.id;
      },

      addEnum: () => {
        const { project } = get();
        if (!project) return null;
        const { schema, namespaceId } = withDefaultNamespace(project.schema);
        const name = uniqueName(
          'new_enum',
          schema.enums.map((e) => e.name),
        );
        const next = addEnum(schema, { name, namespace: namespaceId, values: ['value'] });
        commit(next);
        return next.enums.at(-1)?.id ?? null;
      },

      addColumn: (tableId) => {
        const { project } = get();
        const table = project?.schema.tables.find((t) => t.id === tableId);
        if (!project || !table) return null;
        const schema = project.schema;
        const nativeType =
          schema.dialect === 'sqlite'
            ? 'text'
            : toNativeType(schema.dialect, { kind: 'text' }, { enums: [] });
        const next = addColumn(schema, tableId, {
          name: uniqueName(
            'new_column',
            table.columns.map((c) => c.name),
          ),
          logicalType: { kind: 'text' },
          nativeType,
        });
        commit(next);
        const column = next.tables.find((t) => t.id === tableId)?.columns.at(-1);
        if (column) set({ selection: { tableId, columnId: column.id } });
        return column?.id ?? null;
      },

      removeSelectedTable: () => {
        const { project, selection } = get();
        if (!project || !selection.tableId) return;
        commit(removeTable(project.schema, selection.tableId));
      },

      setRightTab: (rightTab) => {
        set({ rightTab, rightOpen: true });
      },
      toggleLeft: () => {
        set((state) => ({ leftOpen: !state.leftOpen }));
      },
      toggleRight: () => {
        set((state) => ({ rightOpen: !state.rightOpen }));
      },
      openDialog: (dialog) => {
        set({ dialog, paletteOpen: false });
      },
      closeDialog: () => {
        set({ dialog: null });
      },
      setPaletteOpen: (paletteOpen) => {
        set({ paletteOpen });
      },
      requestSearch: () => {
        set((state) => ({ leftOpen: true, searchRequest: state.searchRequest + 1 }));
      },
      setSaveState: (saveState) => {
        set({ saveState });
      },
    };
  });
}

function validSelection(schema: Schema, selection: Selection): Selection {
  const table = schema.tables.find((t) => t.id === selection.tableId);
  if (!table) return { tableId: null, columnId: null };
  const column = table.columns.some((c) => c.id === selection.columnId) ? selection.columnId : null;
  return { tableId: table.id, columnId: column };
}

/** The editor's single store instance. */
export const editorStore = createEditorStore();

export function useEditor<T>(selector: (state: EditorState & EditorActions) => T): T {
  return useStore(editorStore, selector);
}
