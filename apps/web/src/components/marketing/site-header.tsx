import { Logo } from '@dashdb/ui/server';
import Link from 'next/link';
import { ButtonLink, Container } from './primitives';

const NAV = [
  { href: '/features/diagram', label: 'Diagram' },
  { href: '/features/migrations', label: 'Migrations' },
  { href: '/templates', label: 'Templates' },
  { href: '/tools', label: 'Tools' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/changelog', label: 'Changelog' },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <Container className="flex h-16 items-center gap-6">
        <Link
          href="/"
          aria-label="DashDB home"
          className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Logo className="h-7 w-auto" />
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-md px-3 py-2 text-text-muted hover:bg-highlight hover:text-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto">
          {/* `prefetch={false}`: the editor is heavy; don't fetch it until someone heads there. */}
          <ButtonLink href="/app" prefetch={false} className="h-9 px-4">
            Open the editor
          </ButtonLink>
        </div>
      </Container>
    </header>
  );
}
