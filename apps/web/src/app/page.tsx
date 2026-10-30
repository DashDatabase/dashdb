import { Button, Logo, ThemeToggle } from '@dashdb/ui';
import { getApiUrl } from '@/lib/config';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <div className="flex items-center justify-between">
        <h1>
          <Logo className="h-10" />
        </h1>
        <ThemeToggle />
      </div>
      <p className="text-text-muted">
        Web app is running. API health:{' '}
        <a className="font-mono text-primary-text underline" href={`${getApiUrl()}/health`}>
          {getApiUrl()}/health
        </a>
      </p>
      <div>
        <Button>Get started</Button>
      </div>
    </main>
  );
}
