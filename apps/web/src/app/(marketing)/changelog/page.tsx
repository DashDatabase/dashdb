import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { Container, PageHeader } from '@/components/marketing/primitives';
import { proseMdxComponents } from '@/components/marketing/prose-mdx';
import Changelog from '@/content/changelog.mdx';
import { pageMetadata } from '@/lib/seo';
import { getPage } from '@/lib/site';

export const metadata = pageMetadata('changelog');

export default function ChangelogPage() {
  const page = getPage('changelog');
  return (
    <Container className="py-12 sm:py-16">
      <Breadcrumbs page={page} />
      <PageHeader title="Changelog" intro="New features and fixes in DashDB, newest first." />
      <div className="mt-12 max-w-3xl border-l pl-6 sm:pl-8">
        <Changelog components={proseMdxComponents} />
      </div>
    </Container>
  );
}
