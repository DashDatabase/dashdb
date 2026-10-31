// zod schemas for everything read back from storage or imported from a file.
import { schemaSchema } from '@dashdb/core/lite';
import { z } from 'zod';
import {
  NODE_COLORS,
  type Baseline,
  type Layout,
  type NodeLayout,
  type Project,
  type ViewState,
} from './store/types';

export const nodeLayoutSchema: z.ZodType<NodeLayout> = z.strictObject({
  x: z.number(),
  y: z.number(),
  collapsed: z.boolean(),
  color: z.enum(NODE_COLORS),
});

export const layoutSchema: z.ZodType<Layout> = z.strictObject({
  nodes: z.record(z.string(), nodeLayoutSchema),
});

export const viewStateSchema: z.ZodType<ViewState> = z.strictObject({
  selection: z.strictObject({ tableId: z.string().nullable(), columnId: z.string().nullable() }),
  rightTab: z.enum(['inspector', 'code', 'migration']),
  leftOpen: z.boolean(),
  rightOpen: z.boolean(),
});

export const projectSchema: z.ZodType<Project> = z.strictObject({
  id: z.string().min(1),
  name: z.string().max(200),
  schema: schemaSchema,
  layout: layoutSchema,
  view: viewStateSchema,
  revision: z.number().int().nonnegative(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const baselineSchema: z.ZodType<Baseline> = z.strictObject({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().max(200),
  createdAt: z.number(),
  schema: schemaSchema,
});
