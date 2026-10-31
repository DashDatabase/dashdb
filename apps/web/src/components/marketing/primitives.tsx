import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

// Server-rendered building blocks for the marketing pages. Deliberately not `@dashdb/ui`: that
// package is one client bundle, and these pages should ship almost no JavaScript.

const BUTTON_BASE =
  'inline-flex h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none';

const BUTTON_VARIANTS = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'border bg-background hover:bg-highlight',
  ghost: 'hover:bg-highlight',
} as const;

export function buttonClass(variant: keyof typeof BUTTON_VARIANTS = 'primary'): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]}`;
}

export function ButtonLink({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return <Link {...props} className={`${buttonClass(variant)} ${className}`} />;
}

export function Container({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  className = '',
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={`py-16 sm:py-24 ${className}`}>
      <Container>
        <div className="max-w-2xl">
          {eyebrow && (
            <p className="mb-2 text-sm font-semibold tracking-wide text-primary-text uppercase">
              {eyebrow}
            </p>
          )}
          <h2
            id={headingId}
            className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {title}
          </h2>
          {intro && <p className="mt-4 text-lg text-text-muted">{intro}</p>}
        </div>
        {children && <div className="mt-10">{children}</div>}
      </Container>
    </section>
  );
}

/** Title block at the top of an inner page. */
export function PageHeader({ title, intro }: { title: string; intro?: ReactNode }) {
  return (
    <header className="max-w-3xl">
      <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{title}</h1>
      {intro && <p className="mt-4 text-lg text-text-muted sm:text-xl">{intro}</p>}
    </header>
  );
}

/** Long-form text (legal pages, about): readable measure and spacing without a typography plugin. */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-3xl space-y-4 leading-7 text-text [&_a]:text-primary-text [&_a]:underline [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:font-semibold [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:text-text-muted [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-text-muted">
      {children}
    </div>
  );
}
