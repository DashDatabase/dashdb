// Local project storage: one IndexedDB record per project, validated on the way out.
import { createId, createSchema, schemaSchema, type IrDialect, type Schema } from '@dashdb/core';
import { createStore, del, get, set, values, type UseStore } from 'idb-keyval';
import { z } from 'zod';

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly schema: Schema;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export const PROJECT_NAME_MAX = 100;

const projectSchema: z.ZodType<Project> = z.object({
  id: z.string().min(1),
  name: z.string(),
  schema: schemaSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});

let store: UseStore | undefined;
/** Created lazily: IndexedDB only exists in the browser. */
function db(): UseStore {
  store ??= createStore('dashdb', 'projects');
  return store;
}

/** Trims and bounds a user-entered project name, falling back to "Untitled project". */
export function normalizeProjectName(name: string): string {
  return name.trim().slice(0, PROJECT_NAME_MAX) || 'Untitled project';
}

function parseProject(value: unknown): Project | null {
  const result = projectSchema.safeParse(value);
  return result.success ? result.data : null;
}

/** All readable projects, most recently updated first. Corrupt records are skipped. */
export async function listProjects(): Promise<Project[]> {
  const all = await values<unknown>(db());
  return all
    .map(parseProject)
    .filter((project): project is Project => project !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | null> {
  return parseProject(await get<unknown>(id, db()));
}

export async function saveProject(project: Project): Promise<void> {
  await set(project.id, project, db());
}

export async function deleteProject(id: string): Promise<void> {
  await del(id, db());
}

export async function createProject(input: {
  name: string;
  dialect?: IrDialect;
  schema?: Schema;
}): Promise<Project> {
  const now = Date.now();
  const project: Project = {
    id: createId(),
    name: normalizeProjectName(input.name),
    schema: input.schema ?? createSchema(input.dialect ?? 'postgres'),
    createdAt: now,
    updatedAt: now,
  };
  await saveProject(project);
  return project;
}

export async function renameProject(id: string, name: string): Promise<Project | null> {
  const project = await getProject(id);
  if (!project) return null;
  const renamed = { ...project, name: normalizeProjectName(name), updatedAt: Date.now() };
  await saveProject(renamed);
  return renamed;
}

export async function duplicateProject(id: string): Promise<Project | null> {
  const project = await getProject(id);
  if (!project) return null;
  return createProject({ name: `${project.name} (copy)`, schema: project.schema });
}
