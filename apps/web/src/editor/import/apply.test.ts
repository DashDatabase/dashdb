import { describe, expect, it } from 'vitest';
import { shopSchema } from '../canvas/test-schema';
import { parseProjectFile, serializeProjectFile } from '../project-file';
import { createEditorStore } from '../store';
import { layoutFor } from '../store/layout';
import { testProject } from '../test-fixtures';
import { applyProjectFile } from './apply';

function projectFile() {
  const schema = shopSchema();
  const base = layoutFor(schema);
  const [first] = schema.tables;
  if (!first) throw new Error('no tables');
  const layout = {
    nodes: {
      ...base.nodes,
      [first.id]: { x: 999, y: 111, collapsed: true, color: 'accent' as const },
    },
  };
  const parsed = parseProjectFile(serializeProjectFile({ name: 'Other', schema, layout }, []));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return { file: parsed.file, first };
}

describe('applyProjectFile', () => {
  it('replaces schema and layout as one undo step, keeping the project name', () => {
    const store = createEditorStore();
    store.getState().load(testProject());
    const { file, first } = projectFile();

    expect(applyProjectFile(store.getState(), file)).toBe(true);
    const { doc, past } = store.getState();
    expect(doc?.name).toBe('Shop');
    expect(doc?.schema).toEqual(file.project.schema);
    expect(doc?.layout.nodes[first.id]).toEqual({
      x: 999,
      y: 111,
      collapsed: true,
      color: 'accent',
    });
    expect(past).toHaveLength(1);

    store.getState().undo();
    expect(store.getState().doc?.schema.tables).toEqual([]);
  });

  it('changes nothing when the schema cannot be applied', () => {
    const store = createEditorStore();
    const { file } = projectFile();
    expect(applyProjectFile(store.getState(), file)).toBe(false);
    expect(store.getState().doc).toBeNull();
  });
});
