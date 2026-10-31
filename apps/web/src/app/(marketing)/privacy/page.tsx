import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { Container, PageHeader, Prose } from '@/components/marketing/primitives';
import { pageMetadata } from '@/lib/seo';
import { getPage } from '@/lib/site';

export const metadata = pageMetadata('privacy');

export default function PrivacyPage() {
  const page = getPage('privacy');
  return (
    <Container className="py-12 sm:py-16">
      <Breadcrumbs page={page} />
      <PageHeader title="Privacy policy" intro="Last updated October 31, 2026." />
      <div className="mt-10">
        <Prose>
          <p>
            The short version: DashDB is built so that we never receive your database schemas. We
            collect your email address only if you give it to us, and we do not use tracking cookies
            or analytics.
          </p>

          <h2>Your projects stay on your device</h2>
          <p>
            Projects, diagrams, baselines and settings are stored in your browser (IndexedDB and
            local storage) on your own device. They are not sent to DashDB. Parsing, diffing,
            migration generation and image export all run in your browser. Clearing your
            browser&apos;s site data deletes them, so export a <code>.dashdb.json</code> file if you
            want a backup.
          </p>
          <p>
            When you import a schema from an existing database, you run the introspection query
            yourself and paste the result. DashDB never receives your database credentials or the
            data in your tables.
          </p>

          <h2>Information we collect</h2>
          <ul>
            <li>
              <strong>Email address</strong>, if you join the waitlist or newsletter, together with
              the page you signed up on and the time. We use it only to send product news, and you
              can unsubscribe at any time.
            </li>
            <li>
              <strong>Server logs</strong>: like any website, our hosting provider records technical
              request data (such as IP address, browser user agent and the page requested) to
              operate and secure the service. Logs are kept for a limited time.
            </li>
          </ul>

          <h2>Service providers</h2>
          <p>
            We may store waitlist emails with an email delivery provider (Resend) so that we can
            send updates. We do not sell personal information or share it for advertising.
          </p>

          <h2>Cookies</h2>
          <p>
            The site does not set tracking or advertising cookies. Your theme choice and editor
            preferences are kept in your browser&apos;s local storage and never leave your device.
          </p>

          <h2>Your choices</h2>
          <p>
            You can unsubscribe from emails using the link in any message, or ask us to delete your
            email address by writing to <a href="mailto:privacy@dashdb.dev">privacy@dashdb.dev</a>.
            Depending on where you live, you may have further rights to access, correct or delete
            your information; contact us and we will help.
          </p>

          <h2>Changes</h2>
          <p>
            If this policy changes, we will update the date above, and for significant changes we
            will notify waitlist subscribers by email.
          </p>
        </Prose>
      </div>
    </Container>
  );
}
