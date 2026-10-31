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

export type RightTab = 'inspector' | 'code' | 'migration';

export interface Selection {
  readonly tableId: Id | null;
  readonly columnId: Id | null;
}

/** Per-project UI state, persisted so a reload reopens the editor exactly as it was. */
export interface ViewState {
  readonly selection: Selection;
  readonly rightTab: RightTab;
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
