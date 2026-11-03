import type { Id, Schema } from '@dashdb/core/lite';

/** Node tints map to color tokens, never to literal colors. */
export const NODE_COLORS = [
  'default',
  'primary',
  'accent',
  'success',
  'warning',
  'danger',
] as const;
export type NodeColor = (typeof NODE_COLORS)[number];

export interface NodeLayout {
  readonly x: number;
  readonly y: number;
  readonly collapsed: boolean;
  readonly color: NodeColor;
}

/** Canvas presentation, keyed by table id. */
export interface Layout {
  readonly nodes: Readonly<Record<Id, NodeLayout>>;
}

/** The undoable part of a project: everything a user edits. */
export interface ProjectDocument {
  readonly name: string;
  readonly schema: Schema;
  readonly layout: Layout;
}

export const BUILTIN_RIGHT_TABS = ['inspector', 'code', 'migration'] as const;
export type BuiltinRightTab = (typeof BUILTIN_RIGHT_TABS)[number];
/** A built-in tab, or `edition:<id>` for a tab the active edition adds. */
export type RightTab = BuiltinRightTab | `edition:${string}`;

export function isBuiltinRightTab(tab: string): tab is BuiltinRightTab {
  return (BUILTIN_RIGHT_TABS as readonly string[]).includes(tab);
}

export interface Selection {
  readonly tableId: Id | null;
  readonly columnId: Id | null;
}

/** Per-project UI state, persisted so a reload reopens the editor exactly as it was. */
export interface ViewState {
  readonly selection: Selection;
  /** Edition tabs aren't saved: the project may be opened by a build without them. */
  readonly rightTab: BuiltinRightTab;
  readonly leftOpen: boolean;
  readonly rightOpen: boolean;
}

/** A project as stored locally. `revision` increments on every save (multi-tab safety). */
export interface Project extends ProjectDocument {
  readonly id: string;
  readonly view: ViewState;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** An immutable copy of a schema, used as the "before" side of a migration. */
export interface Baseline {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly createdAt: number;
  readonly schema: Schema;
}

export const EMPTY_LAYOUT: Layout = { nodes: {} };

export const DEFAULT_VIEW: ViewState = {
  selection: { tableId: null, columnId: null },
  rightTab: 'inspector',
  leftOpen: true,
  rightOpen: true,
};
