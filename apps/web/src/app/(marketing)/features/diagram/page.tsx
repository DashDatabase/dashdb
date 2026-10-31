import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { ButtonLink, Container, PageHeader, Section } from '@/components/marketing/primitives';
import { pageMetadata } from '@/lib/seo';
import { getPage } from '@/lib/site';

export const metadata = pageMetadata('diagram');

const FEATURES = [
  {
    title: 'A canvas that keeps up',
    body: 'Hundreds of tables stay smooth. Drag a column onto another to draw a relationship; DashDB names the constraint and warns when types differ.',
  },
  {
    title: 'Diagram and code, in sync',
    body: 'Open the Code tab to edit the same schema as SQL, Prisma, Drizzle or DBML. Changes flow both ways, and invalid code never touches the diagram.',
  },
  {
    title: 'Auto-arrange',
    body: 'One click lays out large schemas so parents sit left of their children, computed off the main thread.',
  },
  {
    title: 'Keyboard first',
    body: 'Add tables and columns, undo, duplicate and generate migrations without leaving the keyboard. Press ? for the full list.',
  },
  {
    title: 'Import what you have',
    body: 'Paste SQL (the dialect is detected), upload a .sql, .prisma or .dbml file, or run one read-only query against your database and paste the result.',
  },
  {
    title: 'Export anywhere',
    body: 'PNG or SVG for docs, SQL, Prisma, Drizzle or DBML for code, a Mermaid ER diagram for your README, or a .dashdb.json backup.',
  },
] as const;

export default function DiagramPage() {
  const page = getPage('diagram');
  return (
    <>
      <Container className="pt-12 sm:pt-16">
        <Breadcrumbs page={page} />
        <PageHeader
          title="A database diagram you can actually ship"
          intro="Design tables, columns, enums and relationships visually. The diagram is the schema: export it as code, or turn your edits into a migration."
        />
        <div className="mt-8">
          <ButtonLink href="/app" prefetch={false}>
            Open the editor — no signup
          </ButtonLink>
        </div>
      </Container>

      <Section id="features" eyebrow="Features" title="Everything the canvas does">
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="rounded-lg border p-6">
              <h3 className="text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-text-muted">{feature.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="local-first"
        eyebrow="Local-first"
        title="Your schema never leaves your device"
        intro="Projects live in your browser's storage. There is no account to create and no server that receives your diagrams. Export a .dashdb.json file whenever you want a backup or to move machines."
        className="border-t bg-surface/50"
      />
    </>
  );
}
