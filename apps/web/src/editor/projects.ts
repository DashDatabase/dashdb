// Local project repository on top of Dexie. Every read is validated; every write is atomic.
import { createId, createSchema, type IrDialect, type Schema } from '@dashdb/core/lite';
import { db } from './db';
import { normalizeProjectName } from './project-name';
import { baselineSchema, projectSchema } from './record-schemas';
import { layoutFor } from './store/layout';
import { DEFAULT_VIEW, type Baseline, type Layout, type Project } from './store/types';

export { PROJECT_NAME_MAX, normalizeProjectName } from './project-name';
export type { Baseline, Project } from './store/types';

/** Open-source builds keep this many baselines per project; older ones are pruned. */
export const MAX_BASELINES = 3;

/** The stored project changed (another tab saved, or deleted it) since this copy was loaded. */
export class ProjectConflictError extends Error {
  constructor(readonly reason: 'changed' | 'deleted') {
    super(
      reason === 'deleted'
        ? 'This project was deleted in another tab.'
        : 'This project was changed in another tab.',
    );
    this.name = 'ProjectConflictError';
  }
}

function parseProject(value: unknown): Project | null {
  const result = projectSchema.safeParse(value);
  return result.success ? result.data : null;
}

function parseBaseline(value: unknown): Baseline | null {
  const result = baselineSchema.safeParse(value);
  return result.success ? result.data : null;
}

/** All readable projects, most recently updated first. Corrupt records are skipped. */
export async function listProjects(): Promise<Project[]> {
  const all: unknown[] = await db().projects.orderBy('updatedAt').reverse().toArray();
  return all.map(parseProject).filter((p): p is Project => p !== null);
}

export async function getProject(id: string): Promise<Project | null> {
  return parseProject(await db().projects.get(id));
}

export interface NewProject {
  name: string;
  dialect?: IrDialect;
  schema?: Schema;
  layout?: Layout;
}

export function buildProject({ name, dialect, schema, layout }: NewProject): Project {
  const now = Date.now();
  const resolved = schema ?? createSchema(dialect ?? 'postgres');
  return {
    id: createId(),
    name: normalizeProjectName(name),
    schema: resolved,
    layout: layoutFor(resolved, layout),
    view: DEFAULT_VIEW,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export async function createProject(input: NewProject): Promise<Project> {
  const project = buildProject(input);
  await db().projects.add(project);
  return project;
}

/**
 * Saves `project` if the stored copy is still at `project.revision`, and returns the new
 * revision. Throws ProjectConflictError instead of overwriting another tab's changes.
 */
export async function saveProject(project: Project): Promise<number> {
  const { projects } = db();
  return db().transaction('rw', projects, async () => {
    const stored = await projects.get(project.id);
    if (!stored) throw new ProjectConflictError('deleted');
    if (stored.revision !== project.revision) throw new ProjectConflictError('changed');
    const revision = project.revision + 1;
    await projects.put({ ...project, revision, updatedAt: Date.now() });
    return revision;
  });
}

export async function renameProject(id: string, name: string): Promise<Project | null> {
  const { projects } = db();
  return db().transaction('rw', projects, async () => {
    const project = parseProject(await projects.get(id));
    if (!project) return null;
    const renamed: Project = {
      ...project,
      name: normalizeProjectName(name),
      revision: project.revision + 1,
      updatedAt: Date.now(),
    };
    await projects.put(renamed);
    return renamed;
  });
}

export async function duplicateProject(id: string): Promise<Project | null> {
  const project = await getProject(id);
  if (!project) return null;
  return createProject({
    name: `${project.name} (copy)`,
    schema: project.schema,
    layout: project.layout,
  });
}

export async function deleteProject(id: string): Promise<void> {
  const { projects, baselines } = db();
  await db().transaction('rw', projects, baselines, async () => {
    await baselines.where('projectId').equals(id).delete();
    await projects.delete(id);
  });
}

/** Baselines for a project, newest first. */
export async function listBaselines(projectId: string): Promise<Baseline[]> {
  const rows: unknown[] = await db()
    .baselines.where('[projectId+createdAt]')
    .between([projectId, -Infinity], [projectId, Infinity])
    .reverse()
    .toArray();
  return rows.map(parseBaseline).filter((b): b is Baseline => b !== null);
}

/**
 * Stores an immutable copy of `schema` as a new baseline and prunes to MAX_BASELINES.
 * Returns the project's baselines, newest first.
 */
export async function saveBaseline(
  projectId: string,
  schema: Schema,
  name: string,
): Promise<Baseline[]> {
  const { baselines } = db();
  const baseline: Baseline = {
    id: createId(),
    projectId,
    name: name.trim().slice(0, 100) || 'Baseline',
    createdAt: Date.now(),
    // Detached from editor state so later edits can never reach it.
    schema: structuredClone(schema),
  };
  await db().transaction('rw', baselines, async () => {
    await baselines.add(baseline);
    const ids = await baselines
      .where('[projectId+createdAt]')
      .between([projectId, -Infinity], [projectId, Infinity])
      .reverse()
      .primaryKeys();
    await baselines.bulkDelete(ids.slice(MAX_BASELINES));
  });
  return listBaselines(projectId);
}

/** Writes a project and its baselines as one new project (used by file import). */
export async function insertProjectWithBaselines(
  project: Project,
  baselines: readonly Omit<Baseline, 'id' | 'projectId'>[],
): Promise<void> {
  const { projects, baselines: table } = db();
  await db().transaction('rw', projects, table, async () => {
    await projects.add(project);
    await table.bulkAdd(
      baselines
        .slice(0, MAX_BASELINES)
        .map((b) => ({ ...b, id: createId(), projectId: project.id })),
    );
  });
}
