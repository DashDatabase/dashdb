// Transient canvas UI state that is never saved or undone (hover, open menus, inline rename).
import type { Id } from '@dashdb/core';
import { create } from 'zustand';
import type { RelationshipDraft } from './relationship';

export type CanvasMenu =
  | { kind: 'table'; tableId: Id; x: number; y: number }
  | { kind: 'selection'; x: number; y: number }
  | { kind: 'edge'; edgeId: Id; x: number; y: number }
  | { kind: 'pane'; x: number; y: number; flow: { x: number; y: number } };

interface CanvasUiState {
  hoveredEdge: Id | null;
  renaming: { tableId: Id; columnId: Id | null } | null;
  menu: CanvasMenu | null;
  /** A drawn connection awaiting confirmation, anchored at a screen point. */
  connection: { draft: RelationshipDraft; x: number; y: number } | null;
  setHoveredEdge: (id: Id | null) => void;
  startRename: (tableId: Id, columnId?: Id | null) => void;
  stopRename: () => void;
  openMenu: (menu: CanvasMenu) => void;
  closeMenu: () => void;
  setConnection: (connection: CanvasUiState['connection']) => void;
}

/**
 * Menus return focus to their trigger when they close, and trap it while open, so a rename
 * started from a menu would lose its focus. Hand focus to the rename field instead.
 */
export function keepRenameFocus(event: Event): void {
  if (!useCanvasUi.getState().renaming) return;
  event.preventDefault();
  document.querySelector<HTMLInputElement>('[data-inline-rename]')?.focus();
}

export const useCanvasUi = create<CanvasUiState>()((set) => ({
  hoveredEdge: null,
  renaming: null,
  menu: null,
  connection: null,
  setHoveredEdge: (hoveredEdge) => {
    set({ hoveredEdge });
  },
  startRename: (tableId, columnId = null) => {
    set({ renaming: { tableId, columnId }, menu: null });
  },
  stopRename: () => {
    set({ renaming: null });
  },
  openMenu: (menu) => {
    set({ menu });
  },
  closeMenu: () => {
    set({ menu: null });
  },
  setConnection: (connection) => {
    set({ connection });
  },
}));
