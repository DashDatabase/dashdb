import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createProject,
  deleteProject,
  duplicateProject,
  getProject,
  listProjects,
  normalizeProjectName,
  PROJECT_NAME_MAX,
  renameProject,
  saveProject,
} from './projects';

beforeEach(async () => {
  for (const project of await listProjects()) await deleteProject(project.id);
});

describe('normalizeProjectName', () => {
  it('trims, bounds and defaults names', () => {
    expect(normalizeProjectName('  Shop  ')).toBe('Shop');
    expect(normalizeProjectName('   ')).toBe('Untitled project');
    expect(normalizeProjectName('x'.repeat(500))).toHaveLength(PROJECT_NAME_MAX);
  });
});

describe('project storage', () => {
  it('creates, reads and lists projects newest first', async () => {
    const first = await createProject({ name: 'First', dialect: 'mysql' });
    const second = await createProject({ name: 'Second' });
    await saveProject({ ...first, updatedAt: second.updatedAt + 1 });

    expect((await getProject(second.id))?.schema.dialect).toBe('postgres');
    expect((await listProjects()).map((p) => p.name)).toEqual(['First', 'Second']);
  });

  it('renames, duplicates and deletes', async () => {
    const project = await createProject({ name: 'Shop' });
    expect((await renameProject(project.id, ' Store '))?.name).toBe('Store');

    const copy = await duplicateProject(project.id);
    expect(copy?.name).toBe('Store (copy)');
    expect(copy?.id).not.toBe(project.id);

    await deleteProject(project.id);
    expect(await getProject(project.id)).toBeNull();
    expect(await listProjects()).toHaveLength(1);
  });

  it('returns null for missing projects', async () => {
    expect(await renameProject('missing', 'x')).toBeNull();
    expect(await duplicateProject('missing')).toBeNull();
  });

  it('skips records that fail validation', async () => {
    const project = await createProject({ name: 'Good' });
    await saveProject({ ...project, id: 'bad', schema: { nope: true } as never });
    expect((await listProjects()).map((p) => p.id)).toEqual([project.id]);
    expect(await getProject('bad')).toBeNull();
  });
});
