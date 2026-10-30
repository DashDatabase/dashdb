import { useStore } from 'zustand';
import { createEditorStore, type EditorActions, type EditorState } from './editor-store';

export * from './editor-store';
export * from './types';
export { HISTORY_LIMIT, GROUP_WINDOW_MS } from './history';

/** The editor's single store instance. */
export const editorStore = createEditorStore();

export function useEditor<T>(selector: (state: EditorState & EditorActions) => T): T {
  return useStore(editorStore, selector);
}
