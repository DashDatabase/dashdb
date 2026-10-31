import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { Container, PageHeader, Prose } from '@/components/marketing/primitives';
import { pageMetadata } from '@/lib/seo';
import { getPage } from '@/lib/site';

export const metadata = pageMetadata('terms');

export default function TermsPage() {
  const page = getPage('terms');
  return (
    <Container className="py-12 sm:py-16">
      <Breadcrumbs page={page} />
      <PageHeader title="Terms of service" intro="Last updated October 31, 2026." />
      <div className="mt-10">
        <Prose>
          <p>
            These terms apply to the DashDB website and the DashDB editor (together, &quot;the
            service&quot;). By using the service you agree to them.
          </p>

          <h2>Using DashDB</h2>
          <p>
            You may use the service for personal and commercial work. Don&apos;t use it to break the
            law, to disrupt the service or other people&apos;s use of it, or to try to get around
            its security or rate limits.
          </p>

          <h2>Your content</h2>
          <p>
            Schemas, diagrams and migrations you create are yours. Because the editor stores them in
            your browser, you are responsible for keeping backups (for example, by exporting a{' '}
            <code>.dashdb.json</code> file).
          </p>

          <h2>Generated migrations</h2>
          <p>
            DashDB generates SQL and migration files and flags changes it considers risky, but it
            cannot know everything about your database, your data or your traffic. Review every
            migration and test it before running it against a database you care about. The safety
            review is guidance, not a guarantee.
          </p>

          <h2>No warranty</h2>
          <p>
            The service is provided &quot;as is&quot; and &quot;as available&quot;, without
            warranties of any kind, express or implied, including fitness for a particular purpose
            and non-infringement.
          </p>

          <h2>Limitation of liability</h2>
          <p>
            To the extent permitted by law, DashDB is not liable for any indirect, incidental,
            special or consequential damages, or for loss of data, profits or revenue, arising from
            your use of the service, including from running generated migrations.
          </p>

          <h2>Changes</h2>
          <p>
            We may update these terms as the service evolves. We will change the date above when we
            do; continuing to use the service after a change means you accept the updated terms.
          </p>
        </Prose>
      </div>
    </Container>
  );
}
