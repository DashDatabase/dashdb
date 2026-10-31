import Link from 'next/link';
import { breadcrumbListLd } from '@/lib/json-ld';
import { breadcrumbTrail, type SitePage } from '@/lib/site';
import { JsonLd } from './json-ld';

/** Visible breadcrumbs plus the matching BreadcrumbList structured data. */
export function Breadcrumbs({ page }: { page: SitePage }) {
  const trail = breadcrumbTrail(page);
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-8 text-sm text-text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          {trail.map((crumb, i) => {
            const last = i === trail.length - 1;
            return (
              <li key={crumb.path} className="flex items-center gap-1.5">
                {last ? (
                  <span aria-current="page" className="text-text">
                    {crumb.label}
                  </span>
                ) : (
                  <>
                    <Link href={crumb.path} className="hover:text-text hover:underline">
                      {crumb.label}
                    </Link>
                    <span aria-hidden="true">/</span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd data={breadcrumbListLd(page)} />
    </>
  );
}
