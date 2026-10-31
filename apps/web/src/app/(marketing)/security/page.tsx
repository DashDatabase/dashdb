import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { Container, PageHeader, Prose } from '@/components/marketing/primitives';
import { pageMetadata } from '@/lib/seo';
import { getPage } from '@/lib/site';

export const metadata = pageMetadata('security');

export default function SecurityPage() {
  const page = getPage('security');
  return (
    <Container className="py-12 sm:py-16">
      <Breadcrumbs page={page} />
      <PageHeader
        title="Security"
        intro="The safest schema is the one we never receive. Here is how DashDB is built, and how to report a problem."
      />
      <div className="mt-10">
        <Prose>
          <h2>How DashDB handles your schema</h2>
          <ul>
            <li>
              <strong>Local-first.</strong> Projects are stored in your browser. Parsing, diffing,
              migration generation and exports run on your device.
            </li>
            <li>
              <strong>No database connections.</strong> Importing from a live database means running
              one read-only introspection query yourself and pasting the result. DashDB never
              handles credentials.
            </li>
            <li>
              <strong>Untrusted input is treated as untrusted.</strong> Imported files and pasted
              text are size-limited and validated before they reach your project, and exported SVGs
              are sanitized.
            </li>
          </ul>

          <h2>How we build it</h2>
          <ul>
            <li>
              Every change runs linting with security rules, type checking and automated tests.
            </li>
            <li>
              Continuous scanning: CodeQL, Semgrep, secret scanning over the full history, and
              dependency audits, plus automated dependency updates.
            </li>
            <li>Commits are checked for leaked secrets before they are made.</li>
          </ul>

          <h2>Reporting a vulnerability</h2>
          <p>
            Please email <a href="mailto:security@dashdb.dev">security@dashdb.dev</a> and do not
            open a public issue. Include a description, steps to reproduce, and the affected
            component. We aim to acknowledge reports within 3 business days and follow a 90-day
            coordinated disclosure policy. Good-faith research within the policy is welcome; we will
            not pursue legal action against it.
          </p>
          <p>
            Machine-readable contact details are in{' '}
            <a href="/.well-known/security.txt">/.well-known/security.txt</a>.
          </p>
        </Prose>
      </div>
    </Container>
  );
}
