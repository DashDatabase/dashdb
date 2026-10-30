// Shared builders for unit tests.
import { createSchema, type Schema } from '@dashdb/core';
import { layoutFor } from './store/layout';
import { DEFAULT_VIEW, type Project } from './store/types';

export function testProject(overrides: Partial<Project> = {}): Project {
  const schema: Schema = overrides.schema ?? createSchema('postgres', { id: 'schema' });
  return {
    id: 'project-1',
    name: 'Shop',
    schema,
    layout: layoutFor(schema),
    view: DEFAULT_VIEW,
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}
