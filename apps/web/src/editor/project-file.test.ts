import 'fake-indexeddb/auto';
import { createId } from '@dashdb/core';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DashDb, db, setDb } from './db';
import {
  PROJECT_FILE_VERSION,
  importProjectFile,
  isProjectFileName,
  parseProjectFile,
  serializeProjectFile,
} from './project-file';
import { createProject, listBaselines, listProjects, saveBaseline } from './projects';
import { TEMPLATES, schemaFromTemplate } from './templates';

let name: string;

beforeEach(() => {
  name = `test-${createId()}`;
  setDb(new DashDb(name));
});

afterEach(async () => {
  db().close();
  await Dexie.delete(name);
});

async function blogProject() {
  const template = TEMPLATES.find((t) => t.id === 'blog');
  if (!template) throw new Error('missing template');
  const project = await createProject({ name: 'Blog', schema: await schemaFromTemplate(template) });
  const baselines = await saveBaseline(project.id, project.schema, 'v1');
  return { project, baselines };
}

describe('project files', () => {
  it('round-trips a project and its baselines into a new project', async () => {
    const { project, baselines } = await blogProject();
    const text = serializeProjectFile(project, baselines, new Date('2026-10-31T00:00:00Z'));
    expect(JSON.parse(text)).toMatchObject({
      format: 'dashdb.project',
      version: PROJECT_FILE_VERSION,
      exportedAt: '2026-10-31T00:00:00.000Z',
    });

    const result = await importProjectFile(text);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.project.id).not.toBe(project.id);
    expect(result.project).toMatchObject({
      name: 'Blog',
      schema: project.schema,
      layout: project.layout,
      revision: 0,
    });
    expect((await listBaselines(result.project.id)).map((b) => b.name)).toEqual(['v1']);
    expect(await listProjects()).toHaveLength(2);
  });

  it.each([
    ['not JSON', '{ nope', /Not valid JSON/],
    ['the wrong format', '{"format":"other","version":1}', /format/],
    ['a bad schema', 'BROKEN_SCHEMA', /project\.schema/],
    ['too many baselines', 'TOO_MANY', /project\.baselines/],
    ['a bad layout color', 'BAD_COLOR', /project\.layout\.nodes/],
  ])('rejects %s without writing anything', async (_, input, message) => {
    const { project, baselines } = await blogProject();
    const valid = JSON.parse(serializeProjectFile(project, baselines)) as {
      project: Record<string, unknown> & { layout: { nodes: Record<string, { color: string }> } };
    };
    let text = input;
    if (input === 'BROKEN_SCHEMA') {
      valid.project.schema = { tables: 'nope' };
      text = JSON.stringify(valid);
    } else if (input === 'TOO_MANY') {
      valid.project.baselines = Array.from(
        { length: 4 },
        () => (valid.project.baselines as unknown[])[0],
      );
      text = JSON.stringify(valid);
    } else if (input === 'BAD_COLOR') {
      const [firstNode] = Object.values(valid.project.layout.nodes);
      if (firstNode) firstNode.color = '#ff0000';
      text = JSON.stringify(valid);
    }

    const before = await listProjects();
    const result = await importProjectFile(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.join('\n')).toMatch(message);
    }
    expect(await listProjects()).toEqual(before);
    expect(await listBaselines(project.id)).toEqual(baselines);
  });

  it('explains files from a newer DashDB', () => {
    const result = parseProjectFile('{"format":"dashdb.project","version":99}');
    expect(result).toEqual({
      ok: false,
      errors: [expect.stringContaining('v99') as string],
    });
  });

  it('caps the number of reported problems', () => {
    const result = parseProjectFile(
      JSON.stringify({
        format: 'dashdb.project',
        version: 1,
        exportedAt: 'x',
        project: {
          name: 1,
          schema: { tables: Array.from({ length: 40 }, () => 1) },
          layout: 1,
          baselines: 1,
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeLessThanOrEqual(21);
  });

  it('drops __proto__ keys instead of polluting prototypes', async () => {
    const { project, baselines } = await blogProject();
    const text = serializeProjectFile(project, baselines).replace(
      '"nodes": {',
      '"nodes": {"__proto__": {"x":1,"y":2,"collapsed":false,"color":"default","polluted":true},',
    );
    const result = parseProjectFile(text);
    if (!result.ok) throw new Error(result.errors.join(', '));
    const { nodes } = result.file.project.layout;
    expect(Object.getPrototypeOf(nodes)).toBe(Object.prototype);
    expect(Object.keys(nodes)).not.toContain('__proto__');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('recognizes project file names', () => {
    expect(isProjectFileName('Shop.DASHDB.json')).toBe(true);
    expect(isProjectFileName('shop.json')).toBe(false);
  });
});
