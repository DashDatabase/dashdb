// Editor state: the undoable project document, its history, validation and UI state.
import {
  addColumn,
  addEnum,
  addNamespace,
  addTable,
  removeTable,
  setPrimaryKey,
  toNativeType,
  validateSchema,
  type Id,
  type Schema,
  type SchemaProblem,
} from '@dashdb/core';
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { immer } from 'zustand/middleware/immer';
import type { CodeFormat } from '../code/code-formats';
import { normalizeProjectName } from '../project-name';
import { record, stepBack, stepForward, type History, type HistoryEntry } from './history';
import { freePosition, layoutFor, syncLayout } from './layout';
import { reconcile } from './reconcile';
import type {
  Baseline,
  NodeColor,
  Project,
  ProjectDocument,
  RightTab,
  Selection,
  ViewState,
} from './types';

enablePatches();

export const VALIDATION_DELAY_MS = 150;

export type EditorDialog = 'import' | 'export' | 'problems' | 'rename' | 'deleteTables';
/** One-shot requests the canvas fulfils (it owns the viewport). */
export type CanvasCommand = 'fitView' | 'zoomIn' | 'zoomOut' | 'arrange' | 'selectAll';
export type SaveState = 'saved' | 'saving' | 'error' | 'conflict';

export interface EditOptions {
  /** Consecutive edits with the same group (within a second) undo as one step. */
  group?: string;
}

export interface EditorState {
  projectId: string | null;
  createdAt: number;
  /** Revision last read from or written to storage. */
  revision: number;
  doc: ProjectDocument | null;
  /** Bumped on every document change; the autosave watches it. */
  docVersion: number;
  past: readonly HistoryEntry[];
  future: readonly HistoryEntry[];
  problems: readonly SchemaProblem[];
  baselines: readonly Baseline[];

  selection: Selection;
  focusRequest: { tableId: Id; nonce: number } | null;
  /** Tables selected on the canvas (may be several); `selection` tracks the primary one. */
  canvasSelection: readonly Id[];
  /** Tables awaiting confirmation in the delete dialog. */
  pendingDelete: readonly Id[];
  canvasCommand: { command: CanvasCommand; nonce: number } | null;
  /** Flow coordinates at the middle of the visible canvas; new tables are placed near it. */
  canvasCenter: { x: number; y: number } | null;
  rightTab: RightTab;
  /** Format shown in the Code panel. */
  codeFormat: CodeFormat;
  leftOpen: boolean;
  rightOpen: boolean;
  dialog: EditorDialog | null;
  paletteOpen: boolean;
  searchRequest: number;
  saveState: SaveState;
  /** Other tabs that have this project open. */
  otherTabs: number;
}

export interface EditorActions {
  load: (project: Project, baselines?: readonly Baseline[]) => void;
  /** Snapshot for persistence; null when nothing is loaded. */
  toProject: () => Project | null;

  /** Runs several edits as one undo step. */
  transact: (label: string, run: () => void) => void;
  /** Applies a @dashdb/core edit. Returns false (and changes nothing) if it throws. */
  editSchema: (label: string, change: (schema: Schema) => Schema, options?: EditOptions) => boolean;
  rename: (name: string) => void;
  undo: () => void;
  redo: () => void;

  addTable: () => Id | null;
  addEnum: () => Id | null;
  addColumn: (tableId: Id) => Id | null;
  removeSelectedTable: () => void;
  /** Removes tables (and every foreign key that points at them) as one undo step. */
  removeTables: (tableIds: readonly Id[]) => void;
  /** Opens the delete confirmation for the given tables. */
  requestDeleteTables: (tableIds: readonly Id[]) => void;

  moveNode: (tableId: Id, position: { x: number; y: number }) => void;
  setNodeCollapsed: (tableId: Id, collapsed: boolean) => void;
  setNodeColor: (tableId: Id, color: NodeColor) => void;
  /** Moves many nodes as one undo step (arrange, multi-drag, paste). */
  setNodePositions: (
    positions: Readonly<Record<Id, { x: number; y: number }>>,
    label: string,
  ) => void;

  setBaselines: (baselines: readonly Baseline[]) => void;
  setRevision: (revision: number) => void;

  select: (tableId: Id | null, columnId?: Id | null) => void;
  focusTable: (tableId: Id) => void;
  setCanvasSelection: (tableIds: readonly Id[]) => void;
  setCanvasCenter: (center: { x: number; y: number } | null) => void;
  runCanvasCommand: (command: CanvasCommand) => void;
  setRightTab: (tab: RightTab) => void;
  setCodeFormat: (format: CodeFormat) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  openDialog: (dialog: EditorDialog) => void;
  closeDialog: () => void;
  setPaletteOpen: (open: boolean) => void;
  requestSearch: () => void;
  setSaveState: (state: SaveState) => void;
  setOtherTabs: (count: number) => void;
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
  const next = addNamespace(schema, { name: schema.dialect === 'sqlite' ? 'main' : 'public' });
  const created = next.namespaces[0];
  if (!created) throw new Error('Namespace was not created');
  return { schema: next, namespaceId: created.id };
}

function nativeType(schema: Schema, kind: 'bigint' | 'text'): string {
  if (schema.dialect === 'sqlite') return kind === 'bigint' ? 'integer' : 'text';
  return toNativeType(schema.dialect, { kind }, { enums: [] });
}

function validSelection(schema: Schema, selection: Selection): Selection {
  const table = schema.tables.find((t) => t.id === selection.tableId);
  if (!table) return { tableId: null, columnId: null };
  const column = table.columns.some((c) => c.id === selection.columnId) ? selection.columnId : null;
  return { tableId: table.id, columnId: column };
}

const initialState: EditorState = {
  projectId: null,
  createdAt: 0,
  revision: 0,
  doc: null,
  docVersion: 0,
  past: [],
  future: [],
  problems: [],
  baselines: [],
  selection: { tableId: null, columnId: null },
  focusRequest: null,
  canvasSelection: [],
  pendingDelete: [],
  canvasCommand: null,
  canvasCenter: null,
  rightTab: 'inspector',
  codeFormat: 'sql',
  leftOpen: true,
  rightOpen: true,
  dialog: null,
  paletteOpen: false,
  searchRequest: 0,
  saveState: 'saved',
  otherTabs: 0,
};

export function createEditorStore(options: { now?: () => number } = {}): EditorStore {
  const now = options.now ?? Date.now;

  return createStore<EditorState & EditorActions>()(
    immer((set, get) => {
      let validationTimer: ReturnType<typeof setTimeout> | undefined;
      /** Patches collected by an open transact() call. */
      let transaction: { label: string; patches: Patch[]; inversePatches: Patch[] } | null = null;

      const validateSoon = () => {
        clearTimeout(validationTimer);
        validationTimer = setTimeout(() => {
          const { doc } = get();
          set({ problems: doc ? validateSchema(doc.schema) : [] });
        }, VALIDATION_DELAY_MS);
      };

      const history = (): History => ({ past: get().past, future: get().future });

      /** Commits a document state reached by undo/redo or a new edit. */
      const commit = (doc: ProjectDocument, nextHistory: History, schemaChanged: boolean) => {
        set((state) => {
          state.doc = doc as Draft<ProjectDocument>;
          state.docVersion += 1;
          state.past = nextHistory.past as Draft<HistoryEntry>[];
          state.future = nextHistory.future as Draft<HistoryEntry>[];
          state.selection = validSelection(doc.schema, state.selection);
          if (state.canvasSelection.length > 0) {
            const ids = new Set(doc.schema.tables.map((t) => t.id));
            state.canvasSelection = state.canvasSelection.filter((id) => ids.has(id));
          }
        });
        if (schemaChanged) validateSoon();
      };

      /** Every document mutation funnels through here so it is recorded for undo. */
      const change = (
        label: string,
        recipe: (draft: Draft<ProjectDocument>) => void,
        { group }: EditOptions = {},
      ): boolean => {
        const { doc } = get();
        if (!doc) return false;
        const [next, patches, inversePatches] = produceWithPatches(doc, recipe);
        if (patches.length === 0) return false;
        const schemaChanged = next.schema !== doc.schema;

        if (transaction) {
          transaction.patches.push(...patches);
          transaction.inversePatches.unshift(...inversePatches);
          commit(next, { past: get().past, future: [] }, schemaChanged);
          return true;
        }
        const entry: HistoryEntry = {
          label,
          group: group ?? null,
          at: now(),
          patches,
          inversePatches,
        };
        commit(next, record(history(), entry), schemaChanged);
        return true;
      };

      /** Schema edits always come from @dashdb/core; the layout follows the tables. */
      const changeSchema = (
        label: string,
        edit: (schema: Schema) => Schema,
        opts?: EditOptions,
        /** Adjusts the layout in the same undo step (e.g. placing a new table). */
        arrange?: (layout: Draft<ProjectDocument['layout']>) => void,
      ) => {
        const { doc } = get();
        if (!doc) return false;
        const next = edit(doc.schema);
        return change(
          label,
          (draft) => {
            reconcile(draft, 'schema', next);
            syncLayout(draft.layout, next);
            arrange?.(draft.layout);
          },
          opts,
        );
      };

      const setNode = (
        tableId: Id,
        label: string,
        patch: Partial<{ x: number; y: number; collapsed: boolean; color: NodeColor }>,
        group?: string,
      ) =>
        change(
          label,
          (draft) => {
            const node = draft.layout.nodes[tableId];
            if (node) Object.assign(node, patch);
          },
          group ? { group } : {},
        );

      return {
        ...initialState,

        load: (project, baselines = []) => {
          clearTimeout(validationTimer);
          transaction = null;
          set({
            ...initialState,
            projectId: project.id,
            createdAt: project.createdAt,
            revision: project.revision,
            doc: {
              name: project.name,
              schema: project.schema,
              layout: layoutFor(project.schema, project.layout),
            },
            problems: validateSchema(project.schema),
            baselines: [...baselines],
            selection: validSelection(project.schema, project.view.selection),
            rightTab: project.view.rightTab,
            leftOpen: project.view.leftOpen,
            rightOpen: project.view.rightOpen,
          });
        },

        toProject: () => {
          const s = get();
          if (!s.doc || !s.projectId) return null;
          const view: ViewState = {
            selection: s.selection,
            rightTab: s.rightTab,
            leftOpen: s.leftOpen,
            rightOpen: s.rightOpen,
          };
          return {
            id: s.projectId,
            name: s.doc.name,
            schema: s.doc.schema,
            layout: s.doc.layout,
            view,
            revision: s.revision,
            createdAt: s.createdAt,
            updatedAt: now(),
          };
        },

        transact: (label, run) => {
          if (transaction) {
            run();
            return;
          }
          transaction = { label, patches: [], inversePatches: [] };
          try {
            run();
          } finally {
            const done = transaction;
            transaction = null;
            if (done.patches.length > 0) {
              const entry: HistoryEntry = { ...done, group: null, at: now() };
              set((state) => {
                const next = record(history(), entry);
                state.past = next.past as Draft<HistoryEntry>[];
                state.future = [];
              });
            }
          }
        },

        editSchema: (label, edit, opts) => {
          try {
            return changeSchema(label, edit, opts);
          } catch {
            return false;
          }
        },

        rename: (name) => {
          const normalized = normalizeProjectName(name);
          change('Rename project', (draft) => {
            draft.name = normalized;
          });
        },

        undo: () => {
          const { doc } = get();
          const step = stepBack(history());
          if (!doc || !step) return;
          const next = applyPatches(doc, step.entry.inversePatches as Patch[]);
          commit(next, step.history, next.schema !== doc.schema);
        },

        redo: () => {
          const { doc } = get();
          const step = stepForward(history());
          if (!doc || !step) return;
          const next = applyPatches(doc, step.entry.patches as Patch[]);
          commit(next, step.history, next.schema !== doc.schema);
        },

        addTable: () => {
          const { doc } = get();
          if (!doc) return null;
          // Written inside the edit callback; an object keeps TypeScript's narrowing honest.
          const created: { tableId: Id | null } = { tableId: null };
          const center = get().canvasCenter;
          const position = center ? freePosition(doc.layout, center) : null;
          const ok = changeSchema(
            'Add table',
            (current) => {
              const { schema, namespaceId } = withDefaultNamespace(current);
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
                    nativeType: nativeType(schema, 'bigint'),
                    nullable: false,
                  },
                ],
              });
              const table = withTable.tables.at(-1);
              const id = table?.columns[0]?.id;
              if (!table || !id) throw new Error('Table was not created');
              created.tableId = table.id;
              return setPrimaryKey(withTable, table.id, { columns: [id] });
            },
            undefined,
            (layout) => {
              const node = created.tableId ? layout.nodes[created.tableId] : undefined;
              if (node && position) Object.assign(node, position);
            },
          );
          const { tableId } = created;
          if (!ok || !tableId) return null;
          get().focusTable(tableId);
          return tableId;
        },

        addEnum: () => {
          const created: { enumId: Id | null } = { enumId: null };
          changeSchema('Add enum', (current) => {
            const { schema, namespaceId } = withDefaultNamespace(current);
            const name = uniqueName(
              'new_enum',
              schema.enums.map((e) => e.name),
            );
            const next = addEnum(schema, { name, namespace: namespaceId, values: ['value'] });
            created.enumId = next.enums.at(-1)?.id ?? null;
            return next;
          });
          return created.enumId;
        },

        addColumn: (tableId) => {
          const table = get().doc?.schema.tables.find((t) => t.id === tableId);
          if (!table) return null;
          const created: { columnId: Id | null } = { columnId: null };
          changeSchema('Add column', (schema) => {
            const next = addColumn(schema, tableId, {
              name: uniqueName(
                'new_column',
                table.columns.map((c) => c.name),
              ),
              logicalType: { kind: 'text' },
              nativeType: nativeType(schema, 'text'),
            });
            created.columnId =
              next.tables.find((t) => t.id === tableId)?.columns.at(-1)?.id ?? null;
            return next;
          });
          const { columnId } = created;
          if (columnId) set({ selection: { tableId, columnId } });
          return columnId;
        },

        removeSelectedTable: () => {
          const { tableId } = get().selection;
          if (tableId) changeSchema('Delete table', (schema) => removeTable(schema, tableId));
        },
        removeTables: (tableIds) => {
          const { doc } = get();
          if (!doc) return;
          const existing = new Set(doc.schema.tables.map((t) => t.id));
          const ids = tableIds.filter((id) => existing.has(id));
          if (ids.length === 0) return;
          changeSchema(ids.length === 1 ? 'Delete table' : 'Delete tables', (schema) =>
            ids.reduce(removeTable, schema),
          );
          set((state) => {
            state.canvasSelection = state.canvasSelection.filter((id) => !ids.includes(id));
          });
        },
        requestDeleteTables: (tableIds) => {
          if (tableIds.length === 0) return;
          set({ pendingDelete: [...tableIds], dialog: 'deleteTables', paletteOpen: false });
        },

        moveNode: (tableId, { x, y }) => {
          setNode(tableId, 'Move table', { x, y }, `move:${tableId}`);
        },
        setNodeCollapsed: (tableId, collapsed) => {
          setNode(tableId, collapsed ? 'Collapse table' : 'Expand table', { collapsed });
        },
        setNodeColor: (tableId, color) => {
          setNode(tableId, 'Change table color', { color });
        },
        setNodePositions: (positions, label) => {
          change(label, (draft) => {
            for (const [id, { x, y }] of Object.entries(positions)) {
              const node = draft.layout.nodes[id];
              if (node && (node.x !== x || node.y !== y)) Object.assign(node, { x, y });
            }
          });
        },

        setBaselines: (baselines) => {
          set({ baselines: [...baselines] as Draft<Baseline>[] });
        },
        setRevision: (revision) => {
          set({ revision });
        },

        select: (tableId, columnId = null) => {
          set({ selection: { tableId, columnId } });
        },
        focusTable: (tableId) => {
          set((state) => {
            state.selection = { tableId, columnId: null };
            state.focusRequest = { tableId, nonce: (state.focusRequest?.nonce ?? 0) + 1 };
          });
        },
        setCanvasSelection: (tableIds) => {
          set({ canvasSelection: [...tableIds] });
        },
        setCanvasCenter: (canvasCenter) => {
          set({ canvasCenter });
        },
        runCanvasCommand: (command) => {
          set((state) => {
            state.canvasCommand = { command, nonce: (state.canvasCommand?.nonce ?? 0) + 1 };
          });
        },
        setRightTab: (rightTab) => {
          set({ rightTab, rightOpen: true });
        },
        setCodeFormat: (codeFormat) => {
          set({ codeFormat });
        },
        toggleLeft: () => {
          set((state) => {
            state.leftOpen = !state.leftOpen;
          });
        },
        toggleRight: () => {
          set((state) => {
            state.rightOpen = !state.rightOpen;
          });
        },
        openDialog: (dialog) => {
          set({ dialog, paletteOpen: false });
        },
        closeDialog: () => {
          set({ dialog: null, pendingDelete: [] });
        },
        setPaletteOpen: (paletteOpen) => {
          set({ paletteOpen });
        },
        requestSearch: () => {
          set((state) => {
            state.leftOpen = true;
            state.searchRequest += 1;
          });
        },
        setSaveState: (saveState) => {
          set({ saveState });
        },
        setOtherTabs: (otherTabs) => {
          set({ otherTabs });
        },
      };
    }),
  );
}
