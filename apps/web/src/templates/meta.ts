// The `template` block at the top of a gallery template's .dashdb.json: what the gallery shows.
// Plain project files have no such block; the editor imports both.
import { z } from 'zod';

/** Lowercase words joined by single hyphens, e.g. `multi-tenant`. */
const kebab = z
  .string()
  .regex(/^[a-z0-9-]+$/)
  .refine((s) => !/^-|-$|--/.test(s), 'Use single hyphens between words');

export const templateMetaSchema = z.strictObject({
  title: z.string().min(3).max(60),
  description: z.string().min(50).max(170),
  tags: z.array(kebab.max(24)).min(1).max(6),
  dialect: z.enum(['postgres', 'mysql']),
  /** Must equal the number of tables in the schema (checked by templates.test.ts). */
  tablesCount: z.number().int().positive(),
  /** Why the schema looks the way it does: shown on the template's page. */
  decisions: z
    .array(z.strictObject({ title: z.string().min(3).max(80), body: z.string().min(40).max(600) }))
    .min(3)
    .max(6),
  /** GitHub username or name of the author, for community templates. */
  author: z.string().max(60).optional(),
});

export type TemplateMeta = z.infer<typeof templateMetaSchema>;
