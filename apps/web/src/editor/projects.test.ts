import 'fake-indexeddb/auto';
import { addTable, createId, createSchema } from '@dashdb/core';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DashDb, db, setDb } from './db';
import {
  MAX_BASELINES,
  ProjectConflictError,
  createProject,
  deleteProject,
  duplicateProject,
  getProject,
  listBaselines,
  listProjects,
  normalizeProjectName,
  PROJECT_NAME_MAX,
  renameProject,
  saveBaseline,
  saveProject,
} from './projects';
import { DEFAULT_VIEW } from './store/types';

let name: string;

beforeEach(() => {
  name = `test-${createId()}`;
  setDb(new DashDb(name));
});

afterEach(async () => {
  db().close();
  await Dexie.delete(name);
});

describe('normalizeProjectName', () => {
  it('trims, bounds and defaults names', () => {
    expect(normalizeProjectName('  Shop  ')).toBe('Shop');
    expect(normalizeProjectName('   ')).toBe('Untitled project');
    expect(normalizeProjectName('x'.repeat(500))).toHaveLength(PROJECT_NAME_MAX);
  });
});

describe('projects', () => {
  it('creates projects with a full layout and lists them newest first', async () => {
    const schema = addTable(createSchema('postgres'), { name: 't', namespace: 'ns' });
    const first = await createProject({ name: 'First', schema });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await createProject({ name: 'Second', dialect: 'mysql' });

    expect(Object.keys(first.layout.nodes)).toEqual([schema.tables[0]?.id]);
    expect(first.view).toEqual(DEFAULT_VIEW);
    expect((await getProject(second.id))?.schema.dialect).toBe('mysql');
    expect((await listProjects()).map((p) => p.name)).toEqual(['Second', 'First']);
  });

  it('saves with an increasing revision', async () => {
    const project = await createProject({ name: 'Shop' });
    const revision = await saveProject({ ...project, name: 'Store' });
    expect(revision).toBe(1);
    expect(await getProject(project.id)).toMatchObject({ name: 'Store', revision: 1 });
    expect(await saveProject({ ...project, name: 'Again', revision: 1 })).toBe(2);
  });

  it('refuses to overwrite a newer revision or a deleted project', async () => {
    const project = await createProject({ name: 'Shop' });
    await saveProject({ ...project, name: 'Saved in tab A' });

    await expect(saveProject({ ...project, name: 'Stale tab B' })).rejects.toThrow(
      ProjectConflictError,
    );
    expect((await getProject(project.id))?.name).toBe('Saved in tab A');

    await deleteProject(project.id);
    await expect(saveProject({ ...project, revision: 1 })).rejects.toMatchObject({
      reason: 'deleted',
    });
    expect(await getProject(project.id)).toBeNull();
  });

  it('renames, duplicates and deletes (with baselines)', async () => {
    const project = await createProject({ name: 'Shop' });
    expect(await renameProject(project.id, ' Store ')).toMatchObject({
      name: 'Store',
      revision: 1,
    });

    const copy = await duplicateProject(project.id);
    expect(copy?.name).toBe('Store (copy)');
    expect(copy?.id).not.toBe(project.id);

    await saveBaseline(project.id, project.schema, 'b');
    await deleteProject(project.id);
    expect(await getProject(project.id)).toBeNull();
    expect(await listBaselines(project.id)).toEqual([]);
    expect(await listProjects()).toHaveLength(1);
  });

  it('returns null for missing projects', async () => {
    expect(await renameProject('missing', 'x')).toBeNull();
    expect(await duplicateProject('missing')).toBeNull();
  });

  it('skips stored records that fail validation', async () => {
    const project = await createProject({ name: 'Good' });
    await db().projects.put({ ...project, id: 'bad', schema: { nope: true } as never });
    expect((await listProjects()).map((p) => p.id)).toEqual([project.id]);
    expect(await getProject('bad')).toBeNull();
  });
});

describe('baselines', () => {
  it(`keeps only the ${String(MAX_BASELINES)} most recent per project, newest first`, async () => {
    const project = await createProject({ name: 'Shop' });
    const other = await createProject({ name: 'Other' });
    await saveBaseline(other.id, other.schema, 'other');
    for (let i = 1; i <= MAX_BASELINES + 2; i++) {
      await saveBaseline(project.id, project.schema, `b${String(i)}`);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect((await listBaselines(project.id)).map((b) => b.name)).toEqual(['b5', 'b4', 'b3']);
    expect(await listBaselines(other.id)).toHaveLength(1);
  });

  it('stores a detached copy that later edits cannot reach', async () => {
    const project = await createProject({ name: 'Shop' });
    const schema = { ...project.schema, tables: [] };
    const [baseline] = await saveBaseline(project.id, schema, '  ');
    expect(baseline?.name).toBe('Baseline');
    (schema.tables as unknown[]).push('mutated');
    expect((await listBaselines(project.id))[0]?.schema.tables).toEqual([]);
  });
});

describe('database migrations', () => {
  it('upgrades v1 project records to v2', async () => {
    db().close();
    await Dexie.delete(name);

    // The v1 database exactly as it shipped.
    const v1 = new Dexie(name);
    v1.version(1).stores({ projects: 'id, updatedAt' });
    const schema = createSchema('postgres', { id: 's' });
    await v1
      .table('projects')
      .add({ id: 'old', name: 'Legacy', schema, createdAt: 1, updatedAt: 2 });
    v1.close();

    setDb(new DashDb(name));
    expect(await getProject('old')).toEqual({
      id: 'old',
      name: 'Legacy',
      schema,
      layout: { nodes: {} },
      view: DEFAULT_VIEW,
      revision: 0,
      createdAt: 1,
      updatedAt: 2,
    });
    expect(await listBaselines('old')).toEqual([]);
  });
});
