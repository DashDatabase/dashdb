// Fumadocs MDX collections: the docs at /docs and the blog at /blog. `fumadocs-mdx` compiles
// them at build time into `.source/` (generated, git-ignored); see src/lib/source.ts.
import { pageSchema } from 'fumadocs-core/source/schema';
import { defineCollections, defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { z } from 'zod';
import { AUTHOR_IDS } from './src/blog/authors';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema.extend({
      // Search and the <meta name="description">; required so no page ships without one.
      description: z.string().min(50).max(170),
    }),
  },
});

export const blog = defineCollections({
  type: 'doc',
  dir: 'content/blog',
  schema: pageSchema.extend({
    description: z.string().min(50).max(170),
    author: z.enum(AUTHOR_IDS),
    date: z.iso.date(),
    tags: z
      .array(
        // Lowercase words joined by single hyphens, e.g. `zero-downtime`.
        z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .refine((tag) => !/^-|-$|--/.test(tag)),
      )
      .min(1)
      .max(5),
  }),
  // The Markdown text of each post, for its reading time.
  postprocess: { includeProcessedMarkdown: true },
});

export default defineConfig();
