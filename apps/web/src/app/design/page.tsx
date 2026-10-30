import { Logo, ThemeToggle } from '@dashdb/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Showcase, TokenSwatches } from './showcase';

export const metadata: Metadata = { title: 'Design system' };

/** Living style guide. Development only: production builds render a 404. */
export default function DesignPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Logo className="h-7" />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-10 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Design system</h1>
          <p className="max-w-2xl text-text-muted">
            Every @dashdb/ui component, rendered in both themes. The toggle switches the page; the
            panels below are pinned. Overlays (menus, dialogs, toasts) portal to the page, so they
            follow the toggle.
          </p>
        </div>
        <TokenSwatches />
        <div className="grid gap-6 xl:grid-cols-2">
          <section
            aria-labelledby="light-theme"
            className="light rounded-lg border bg-background p-6"
          >
            <h2 id="light-theme" className="mb-6 text-xl font-semibold">
              Light theme
            </h2>
            <Showcase />
          </section>
          <section
            aria-labelledby="dark-theme"
            className="dark rounded-lg border bg-background p-6"
          >
            <h2 id="dark-theme" className="mb-6 text-xl font-semibold">
              Dark theme
            </h2>
            <Showcase />
          </section>
        </div>
      </main>
    </div>
  );
}
