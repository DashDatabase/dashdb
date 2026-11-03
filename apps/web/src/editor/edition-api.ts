// The editor as edition code sees it (`EditorApi` from @dashdb/edition).
import type { EditorApi } from '@dashdb/edition';
import { exportProject, listLocalProjects } from './project-file';
import { editorStore, type EditorStore } from './store';

export function createEditorApi(store: EditorStore = editorStore): EditorApi {
  return {
    projectId: () => store.getState().projectId,
    applyRemoteChange: (patches) => store.getState().applyRemoteChange(patches),
    listLocalProjects,
    exportProject: (projectId) => exportProject(projectId),
  };
}

/** The one EditorApi for the app's editor store. */
export const editorApi: EditorApi = createEditorApi();
