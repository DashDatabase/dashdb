import { Logo } from '@dashdb/ui/server';
import Link from 'next/link';
import { getGithubUrl } from '@/lib/config';
import { PAGES, SITE, type SitePage } from '@/lib/site';
import { Container } from './primitives';

const GROUPS = ['Product', 'Project', 'Legal'] as const;

export function SiteFooter() {
  const pages: readonly SitePage[] = PAGES;
  return (
    <footer className="border-t bg-surface">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo className="h-7 w-auto" />
          <p className="mt-3 max-w-xs text-sm text-text-muted">{SITE.headline}</p>
        </div>
        {GROUPS.map((group) => (
          <nav key={group} aria-label={group}>
            <h2 className="text-sm font-semibold">{group}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {pages
                .filter((p) => p.group === group)
                .map((p) => (
                  <li key={p.path}>
                    <Link href={p.path} className="text-text-muted hover:text-text hover:underline">
                      {p.label}
                    </Link>
                  </li>
                ))}
              {group === 'Project' && (
                <li>
                  <a
                    href={getGithubUrl()}
                    className="text-text-muted hover:text-text hover:underline"
                  >
                    GitHub
                  </a>
                </li>
              )}
              {group === 'Product' && (
                <li>
                  <Link
                    href="/app"
                    prefetch={false}
                    className="text-text-muted hover:text-text hover:underline"
                  >
                    Open the editor
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        ))}
      </Container>
      <Container className="border-t py-6 text-xs text-text-muted">
        <p>
          © {new Date().getFullYear()} DashDB. Product and database names are trademarks of their
          respective owners and are used only to describe compatibility.
        </p>
      </Container>
    </footer>
  );
}
