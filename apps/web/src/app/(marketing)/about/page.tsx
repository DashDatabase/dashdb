import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { ButtonLink, Container, PageHeader, Prose } from '@/components/marketing/primitives';
import { pageMetadata } from '@/lib/seo';
import { getPage } from '@/lib/site';

export const metadata = pageMetadata('about');

export default function AboutPage() {
  const page = getPage('about');
  return (
    <Container className="py-12 sm:py-16">
      <Breadcrumbs page={page} />
      <PageHeader
        title="Schema design and migrations belong together"
        intro="DashDB started from a familiar gap: the diagram lives in one tool, the migration in another, and the risky part (what the migration does to a busy table) lives in someone's head."
      />
      <div className="mt-12">
        <Prose>
          <h2>What we believe</h2>
          <ul>
            <li>
              <strong>The diagram should be the source of truth.</strong> If you can see the schema,
              you should be able to ship it, without retyping it as code.
            </li>
            <li>
              <strong>Migrations deserve a review.</strong> Most outages from schema changes are
              predictable: a rewrite, a lock, a scan. Software can point them out before they run.
            </li>
            <li>
              <strong>Your schema is yours.</strong> DashDB runs in your browser and keeps projects
              on your device. You should not need an account to draw a table.
            </li>
          </ul>

          <h2>Where it is going</h2>
          <p>
            Next up are features that need a server, built so the local editor keeps working without
            one: sync across machines, share links, and reviewing schema changes as a team. The{' '}
            <a href="/changelog">changelog</a> tracks what has shipped.
          </p>
        </Prose>
      </div>
      <ButtonLink href="/app" prefetch={false} className="mt-10">
        Open the editor — no signup
      </ButtonLink>
    </Container>
  );
}
