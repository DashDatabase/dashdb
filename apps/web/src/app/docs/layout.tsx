import { Logo, THEME_STORAGE_KEY } from '@dashdb/ui/server';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import DocsSearchDialog from '@/components/docs/search-dialog';
import { getGithubUrl } from '@/lib/config';
import { source } from '@/lib/source';
import './docs.css';

// Fumadocs' provider and layout live here, not in the root layout, so only /docs ships them.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      search={{ SearchDialog: DocsSearchDialog }}
      // The site's own theme setting (light, dark or system, under the same storage key), so
      // the docs toggle and the editor's stay in step.
      theme={{
        storageKey: THEME_STORAGE_KEY,
        attribute: 'class',
        defaultTheme: 'system',
        enableSystem: true,
        disableTransitionOnChange: true,
        hotKey: false,
      }}
    >
      <DocsLayout
        tree={source.getPageTree()}
        nav={{
          title: (
            <>
              <Logo className="h-6 w-auto" />
              <span className="sr-only">DashDB docs home</span>
            </>
          ),
          url: '/docs',
        }}
        githubUrl={getGithubUrl()}
        links={[
          { text: 'Blog', url: '/blog' },
          { text: 'Templates', url: '/templates' },
          { text: 'Tools', url: '/tools' },
          // External: opens beside the docs, and the editor's code is never prefetched.
          { text: 'Open the editor', url: '/app', external: true },
        ]}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
