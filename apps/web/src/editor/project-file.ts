// Full-project export/import as `.dashdb.json`: a versioned, zod-validated envelope.
import { schemaSchema } from '@dashdb/core/lite';
import { z } from 'zod';
import { templateMetaSchema } from '@/templates/meta';
import {
  buildProject,
  getProject,
  insertProjectWithBaselines,
  listBaselines,
  listProjects,
  MAX_BASELINES,
} from './projects';
import { layoutSchema } from './record-schemas';
import type { Baseline, Project } from './store/types';

export const PROJECT_FILE_FORMAT = 'dashdb.project';
export const PROJECT_FILE_VERSION = 1;
export const PROJECT_FILE_EXTENSION = '.dashdb.json';
/** Larger files are rejected before parsing. */
export const MAX_PROJECT_FILE_BYTES = 10 * 1024 * 1024;

const projectFileSchema = z.strictObject({
  format: z.literal(PROJECT_FILE_FORMAT),
  version: z.literal(PROJECT_FILE_VERSION),
  exportedAt: z.iso.datetime(),
  // Gallery templates (content/templates) describe themselves here; imports ignore it.
  template: templateMetaSchema.optional(),
  project: z.strictObject({
    name: z.string().max(200),
    schema: schemaSchema,
    layout: layoutSchema,
    baselines: z
      .array(
        z.strictObject({
          name: z.string().max(200),
          createdAt: z.number(),
          schema: schemaSchema,
        }),
      )
      .max(MAX_BASELINES),
  }),
});

export type ProjectFile = z.infer<typeof projectFileSchema>;

export function serializeProjectFile(
  project: Pick<Project, 'name' | 'schema' | 'layout'>,
  baselines: readonly Baseline[],
  now: Date = new Date(),
): string {
  const file: ProjectFile = {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    exportedAt: now.toISOString(),
    project: {
      name: project.name,
      schema: project.schema,
      layout: project.layout,
      baselines: baselines
        .slice(0, MAX_BASELINES)
        .map(({ name, createdAt, schema }) => ({ name, createdAt, schema })),
    },
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Every project in this browser, newest first: what an "upload to cloud" flow offers. */
export async function listLocalProjects(): Promise<{ id: string; name: string }[]> {
  return (await listProjects()).map(({ id, name }) => ({ id, name }));
}

/** A stored project as `.dashdb.json` text with its baselines, or null if it doesn't exist. */
export async function exportProject(id: string, now?: Date): Promise<string | null> {
  const [project, baselines] = await Promise.all([getProject(id), listBaselines(id)]);
  return project ? serializeProjectFile(project, baselines, now) : null;
}

export type ParseProjectFileResult =
  { ok: true; file: ProjectFile } | { ok: false; errors: string[] };

function formatPath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? '(file)' : path.map(String).join('.');
}

/** Parses and validates a project file. Never throws; problems come back as messages. */
export function parseProjectFile(text: string): ParseProjectFileResult {
  if (new Blob([text]).size > MAX_PROJECT_FILE_BYTES) {
    return { ok: false, errors: ['The file is larger than 10 MB.'] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      errors: [`Not valid JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
  if (typeof raw === 'object' && raw !== null && 'format' in raw && 'version' in raw) {
    const { format, version } = raw;
    if (
      format === PROJECT_FILE_FORMAT &&
      typeof version === 'number' &&
      version > PROJECT_FILE_VERSION
    ) {
      return {
        ok: false,
        errors: [
          `This file uses project format v${String(version)}, made by a newer DashDB. Update DashDB to open it.`,
        ],
      };
    }
  }
  const result = projectFileSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.issues
      .slice(0, 20)
      .map((issue) => `${formatPath(issue.path)}: ${issue.message}`);
    if (result.error.issues.length > 20) {
      errors.push(`…and ${String(result.error.issues.length - 20)} more problems.`);
    }
    return { ok: false, errors };
  }
  return { ok: true, file: result.data };
}

/**
 * Imports a project file as a brand-new project (fresh id) together with its baselines.
 * Validation happens before anything is written, and the write is a single transaction, so a
 * bad file can never touch existing projects.
 */
export async function importProjectFile(
  text: string,
): Promise<{ ok: true; project: Project } | { ok: false; errors: string[] }> {
  const parsed = parseProjectFile(text);
  if (!parsed.ok) return parsed;
  const { project: data } = parsed.file;
  const project = buildProject({ name: data.name, schema: data.schema, layout: data.layout });
  await insertProjectWithBaselines(project, data.baselines);
  return { ok: true, project };
}

export function isProjectFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(PROJECT_FILE_EXTENSION);
}
