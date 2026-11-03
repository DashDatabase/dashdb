// First run: a ready-made "SaaS starter" project with the guided tour switched on.
import { track } from '@/lib/telemetry';
import { createProject } from '../projects';
import type { Project } from '../store';
import { TEMPLATES, schemaFromTemplate } from '../templates';
import { tourStore } from './tour';

export const STARTER_NAME = 'SaaS starter';

export async function createStarterProject(): Promise<Project> {
  const template = TEMPLATES.find((t) => t.id === 'saas');
  if (!template) throw new Error('The SaaS template is missing');
  const project = await createProject({
    name: STARTER_NAME,
    schema: await schemaFromTemplate(template),
  });
  tourStore.getState().start(project.id);
  track('project_created', { source: 'starter', dialect: project.schema.dialect });
  return project;
}
