import Link from 'next/link';
import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { Container, PageHeader, Prose } from '@/components/marketing/primitives';
import { getGithubUrl } from '@/lib/config';
import { pageMetadata } from '@/lib/seo';
import { getPage } from '@/lib/site';

export const metadata = pageMetadata('contribute-template');

const EXAMPLE = `"template": {
  "title": "Ride sharing",
  "description": "Riders, drivers, vehicles, trips with fare breakdowns and ratings, for a ride-hailing app.",
  "tags": ["mobility", "marketplace", "payments"],
  "dialect": "postgres",
  "tablesCount": 8,
  "decisions": [
    {
      "title": "Trips copy the fare",
      "body": "Explain the choice and its trade-off in two or three sentences."
    }
  ],
  "author": "your-github-username"
}`;

function Code({ children }: { children: string }) {
  return (
    <pre
      tabIndex={0}
      className="overflow-x-auto rounded-lg border bg-surface p-4 font-mono text-[13px] leading-6 text-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <code>{children}</code>
    </pre>
  );
}

export default function ContributeTemplatePage() {
  const page = getPage('contribute-template');
  const repo = getGithubUrl();
  return (
    <Container className="py-12 sm:py-16">
      <Breadcrumbs page={page} />
      <PageHeader
        title="Contribute a template"
        intro="Designed a schema others could learn from? Share it in the gallery. Templates are plain DashDB project files, submitted with a pull request."
      />
      <div className="mt-10">
        <Prose>
          <h2>1. Design the schema in DashDB</h2>
          <p>
            Build the schema in the{' '}
            <Link href="/app" prefetch={false}>
              editor
            </Link>{' '}
            and arrange the diagram so it reads well: it becomes the preview on the template&apos;s
            page. Starting from SQL you already have? Import it, or use the script in the
            repository, which lays the tables out for you:
          </p>
          <Code>pnpm --filter @dashdb/web template:from-sql schema.sql meta.json my-template</Code>

          <h2>2. Export the project</h2>
          <p>
            Choose Export → DashDB project and save the file as{' '}
            <code>apps/web/content/templates/&lt;slug&gt;.dashdb.json</code>. The slug is the URL:
            lowercase words joined by hyphens, such as <code>ride-sharing</code>. Remove saved
            baselines; templates ship without history.
          </p>

          <h2>3. Describe it</h2>
          <p>
            Add a <code>template</code> block at the top of the file. The decisions are the heart of
            it: explain why the schema is shaped the way it is, and what a reader might change.
          </p>
          <Code>{EXAMPLE}</Code>

          <h2>4. Check it and open a pull request</h2>
          <p>
            Run the same check CI runs. It validates the file, confirms that{' '}
            <code>tablesCount</code> and <code>dialect</code> match the schema, and renders the
            preview and the SQL and Prisma downloads:
          </p>
          <Code>pnpm --filter @dashdb/web templates:check</Code>
          <p>
            Then open a pull request on <a href={repo}>GitHub</a> with the file and a sentence about
            what the schema is for.
          </p>

          <h2>What makes a good template</h2>
          <ul>
            <li>A real use case with 5 to 15 tables that an actual product would need.</li>
            <li>Every table earns its place; generic extras are left out.</li>
            <li>3 to 6 design decisions that explain the trade-offs, not just the tables.</li>
            <li>
              Primary keys everywhere, deliberate <code>ON DELETE</code> rules,{' '}
              <code>NOT NULL</code> where values are required, and indexes for the obvious queries.
            </li>
            <li>No real data, and no real names of people or companies.</li>
          </ul>
          <p>
            Templates are distributed under the project&apos;s{' '}
            <Link href="/open-source">license</Link>; contributing one means agreeing to that.
          </p>
        </Prose>
      </div>
    </Container>
  );
}
