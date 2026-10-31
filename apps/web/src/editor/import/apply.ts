// Applying an imported project file to the open project as one undoable step.
import type { ProjectFile } from '../project-file';
import type { EditorActions } from '../store';

const LABEL = 'Import project file';

/**
 * Replaces the open project's schema and layout with the file's. Baselines stay with the open
 * project; importing a file on the projects home brings its baselines along as a new project.
 */
export function applyProjectFile(
  editor: Pick<
    EditorActions,
    'transact' | 'editSchema' | 'setNodePositions' | 'setNodeCollapsed' | 'setNodeColor'
  >,
  file: ProjectFile,
): boolean {
  const { schema, layout } = file.project;
  let applied = false;
  editor.transact(LABEL, () => {
    applied = editor.editSchema(LABEL, () => schema);
    if (!applied) return;
    const nodes = Object.entries(layout.nodes).filter(([id]) =>
      schema.tables.some((t) => t.id === id),
    );
    editor.setNodePositions(
      Object.fromEntries(nodes.map(([id, { x, y }]) => [id, { x, y }])),
      LABEL,
    );
    for (const [id, node] of nodes) {
      editor.setNodeCollapsed(id, node.collapsed);
      editor.setNodeColor(id, node.color);
    }
  });
  return applied;
}
