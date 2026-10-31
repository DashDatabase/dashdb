import type { Metadata } from 'next';
import { ButtonLink, Container } from '@/components/marketing/primitives';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteHeader } from '@/components/marketing/site-header';

// Next.js adds `noindex` to 404 responses itself.
export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-text">
      <SiteHeader />
      <main id="main" className="flex flex-1 items-center">
        <Container className="py-24 text-center">
          <p className="font-mono text-sm text-primary-text">404</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            This page doesn&apos;t exist
          </h1>
          <p className="mt-4 text-lg text-text-muted">
            The link may be broken, or the page may have moved.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/">Go to the home page</ButtonLink>
            <ButtonLink href="/app" prefetch={false} variant="outline">
              Open the editor
            </ButtonLink>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
