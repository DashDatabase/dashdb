import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { docsMdxComponents } from '@/components/docs/mdx';
import { JsonLd } from '@/components/marketing/json-ld';
import { docsPage } from '@/lib/content-pages';
import { breadcrumbListLd, techArticleLd } from '@/lib/json-ld';
import { metadataFor } from '@/lib/seo';
import { source } from '@/lib/source';

interface Params {
  slug?: string[];
}

export const dynamicParams = false;

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const page = source.getPage((await params).slug);
  return page ? metadataFor(docsPage(page)) : {};
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  const MDX = page.data.body;
  const sitePage = docsPage(page);
  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <JsonLd data={[techArticleLd(sitePage, ['DashDB']), breadcrumbListLd(sitePage)]} />
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={{
            ...docsMdxComponents,
            // Relative links between docs files (`./prisma.mdx`) resolve to page URLs.
            a: createRelativeLink(source, page),
          }}
        />
      </DocsBody>
    </DocsPage>
  );
}
