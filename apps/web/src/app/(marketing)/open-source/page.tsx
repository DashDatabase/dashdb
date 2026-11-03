import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { Container, PageHeader, Prose } from '@/components/marketing/primitives';
import { StarButton } from '@/components/marketing/star-button';
import { getGithubUrl } from '@/lib/config';
import { pageMetadata } from '@/lib/seo';
import { getPage } from '@/lib/site';

export const metadata = pageMetadata('open-source');

export const revalidate = 3600;

export default function OpenSourcePage() {
  const page = getPage('open-source');
  const repo = getGithubUrl();
  return (
    <Container className="py-12 sm:py-16">
      <Breadcrumbs page={page} />
      <PageHeader
        title="Built in the open"
        intro="DashDB's code lives on GitHub: the editor, the schema engine, the parsers and the migration safety rules."
      />
      <div className="mt-8">
        <StarButton />
      </div>
      <div className="mt-12">
        <Prose>
          <h2>What is in the repository</h2>
          <ul>
            <li>
              <strong>The editor</strong>: the canvas, Code tab, import and export, and the
              Migration panel you use at <a href="/app">dashdb.dev/app</a>.
            </li>
            <li>
              <strong>The schema engine</strong>: one schema model with parsers for SQL, Prisma and
              DBML, serializers for SQL, Prisma, Drizzle and DBML, and the diff that powers
              migrations.
            </li>
            <li>
              <strong>The safety rules</strong>: each rule is a small, tested module. If you know a
              locking pitfall we miss, it is a good first contribution.
            </li>
          </ul>

          <h2>Run it yourself</h2>
          <p>
            The editor works entirely in the browser, so self-hosting is a standard Next.js
            deployment with no database required. The README in the <a href={repo}>repository</a>{' '}
            has the commands.
          </p>

          <h2>License</h2>
          <p>
            DashDB Community is AGPL: everything in the repository is open source under the{' '}
            <a href={`${repo}/blob/HEAD/LICENSE`}>GNU Affero General Public License v3.0</a>{' '}
            (AGPL-3.0). Paid cloud, Team and Enterprise features are developed separately under a
            commercial license.
          </p>
          <ul>
            <li>
              <strong>You can</strong> use it for free for any purpose, including commercial work,
              and read, modify, self-host and share it.
            </li>
            <li>
              <strong>If you run a modified version as a service</strong> for other people, you must
              offer them the source code of your changes, under the AGPL too.
            </li>
            <li>
              <strong>Your schemas and migrations are yours.</strong> The license covers
              DashDB&apos;s code, not what you design with it.
            </li>
            <li>
              <strong>Need different terms?</strong> A commercial license for DashDB Community is
              available if the AGPL doesn&apos;t suit your company.
            </li>
            <li>
              <strong>The name and logo are not covered by the license.</strong> Saying your project
              works with or is based on DashDB is fine; a changed version you offer to others needs
              its own name and logo. See the{' '}
              <a href={`${repo}/blob/HEAD/TRADEMARKS.md`}>trademark policy</a>.
            </li>
          </ul>

          <h2>Feedback and contributions</h2>
          <p>
            Found a bug, or a migration DashDB got wrong?{' '}
            <a href={`${repo}/issues`}>Open an issue</a> with the before and after schema if you can
            share them. Ideas and questions are welcome in{' '}
            <a href={`${repo}/discussions`}>Discussions</a>. For security problems, please follow
            the <a href="/security">security policy</a> instead of opening a public issue.
          </p>
        </Prose>
      </div>
    </Container>
  );
}
