// Canvas commands that only need the editor store, shared by the action registry and menus.
import type { Id } from '@dashdb/core/lite';
import type { EditorActions, EditorState } from '../store';
import {
  copyTables,
  nextPasteOffset,
  pasteTables,
  readClipboard,
  type PasteResult,
} from './clipboard';

type Editor = EditorState & EditorActions;

/** The canvas multi-selection, or the single selected table. */
export function selectedTableIds(state: EditorState): readonly Id[] {
  if (state.canvasSelection.length > 0) return state.canvasSelection;
  return state.selection.tableId ? [state.selection.tableId] : [];
}

export function copySelection(state: Editor, tableIds = selectedTableIds(state)): boolean {
  if (!state.doc) return false;
  return copyTables(state.doc.schema, state.doc.layout, tableIds) !== null;
}

export type PasteOutcome = 'pasted' | 'empty' | 'dialect';

/** Pastes the clipboard as one undo step and selects the copies. */
export function pasteClipboard(state: Editor, label = 'Paste tables'): PasteOutcome {
  const clip = readClipboard();
  if (!clip || !state.doc) return 'empty';
  if (clip.dialect !== state.doc.schema.dialect) return 'dialect';
  const offset = nextPasteOffset();
  const pasted: { result: PasteResult | null } = { result: null };
  state.transact(label, () => {
    state.editSchema(label, (schema) => {
      pasted.result = pasteTables(schema, clip, offset);
      return pasted.result.schema;
    });
    if (pasted.result) state.setNodePositions(pasted.result.positions, label);
  });
  const { result } = pasted;
  if (!result) return 'empty';
  state.setCanvasSelection(result.tableIds);
  const first = result.tableIds[0];
  if (first) state.select(first);
  return 'pasted';
}

export function duplicateSelection(
  state: Editor,
  tableIds = selectedTableIds(state),
): PasteOutcome {
  if (!copySelection(state, tableIds)) return 'empty';
  return pasteClipboard(state, tableIds.length === 1 ? 'Duplicate table' : 'Duplicate tables');
}
