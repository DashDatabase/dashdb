import { rules } from '@dashdb/core';
import { createSearchAPI, type AdvancedIndex } from 'fumadocs-core/search/server';
import { DIALECT_NAMES, RULE_GUIDES } from '@/guides/rule-guides';
import { guidePage } from '@/lib/site';
import { getPosts, source } from '@/lib/source';

// The docs search index, exported once at build time as a static JSON file. The search dialog
// downloads it and answers queries in the browser (see components/docs/search-dialog.tsx).
export const dynamic = 'force-static';

/** The safety guides are TSX pages, so their index entries are built from the guide text. */
function guideIndexes(): AdvancedIndex[] {
  return rules.flatMap((rule) =>
    rule.dialects.map((dialect) => {
      const guide = RULE_GUIDES[rule.id];
      const page = guidePage(rule.id, dialect);
      return {
        id: page.path,
        url: page.path,
        title: page.title,
        description: page.description,
        breadcrumbs: ['Safety rules', DIALECT_NAMES[dialect]],
        structuredData: {
          headings: [
            { id: 'why-title', content: 'Why it happens' },
            { id: 'safer-title', content: 'The safer way' },
          ],
          contents: [
            { heading: undefined, content: `${rule.id}: ${guide?.risk ?? ''}` },
            { heading: 'why-title', content: guide?.why ?? '' },
            ...(guide?.saferSteps ?? []).map((step) => ({ heading: 'safer-title', content: step })),
          ],
        },
      };
    }),
  );
}

const search = createSearchAPI('advanced', {
  indexes: async () => [
    ...source.getPages().map((page) => ({
      id: page.url,
      url: page.url,
      title: page.data.title,
      description: page.data.description,
      breadcrumbs: ['Docs'],
      structuredData: page.data.structuredData,
    })),
    ...guideIndexes(),
    ...(await getPosts()).map((post) => ({
      id: post.path,
      url: post.path,
      title: post.title,
      description: post.description,
      breadcrumbs: ['Blog'],
      structuredData: post.entry.structuredData,
    })),
  ],
});

export const GET = search.staticGET;
